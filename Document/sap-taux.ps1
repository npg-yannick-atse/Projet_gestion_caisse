# =====================================================================
#  sap-taux.ps1 — inspecte les TAUX DE CHANGE dans SAP (LECTURE SEULE)
#
#  Lit, via RFC_READ_TABLE :
#    TCURC : correspondance devise SAP -> code ISO  (le pont FCFA <-> XOF)
#    TCURV : les types de cours (M = cours moyen, B = achat, G = vente...)
#    TCURF : les facteurs de conversion (rapport 1:1, 1:100...)
#    TCURR : les cours eux-memes (couple de devises, date, taux)
#
#  Aucune ecriture. Usage :
#    .\sap-taux.ps1                       # devises NPG (FCFA/EUR/USD)
#    .\sap-taux.ps1 -Devises "EUR,USD"
#
#  A SAVOIR (constate le 11/08/2026 sur le clone 10.200.200.200) :
#   - NPG cote en 'FCFA', PAS en 'XOF'. TCURC donne FCFA -> ISO XOF.
#     Une lecture sur 'XOF' ne ramene AUCUN cours.
#   - UKURS suffixe d'un '-' = cotation INDIRECTE (notation SAP du negatif).
#   - TCURR contient des lignes parasites : cours a 0,00 et cours de demo
#     SAP a 0,94 dates de 2001. Toujours filtrer avant d'importer.
#
#  Le mot de passe est pris dans backend\.env (SAP_PASSWD) s'il est vide
#  dans sap.env, pour permettre une execution non interactive.
# =====================================================================
param(
    [string]$Devises = "FCFA,EUR,USD",
    [string]$TypeCours = "M",
    [int]$MaxLignes = 300
)

$ErrorActionPreference = "Stop"

function Read-EnvFile([string]$path) {
    $cfg = @{}
    if (-not (Test-Path $path)) { return $cfg }
    Get-Content $path | ForEach-Object {
        $l = $_.Trim()
        if ($l -and -not $l.StartsWith("#")) {
            $idx = $l.IndexOf("=")
            if ($idx -gt 0) { $cfg[$l.Substring(0, $idx).Trim()] = $l.Substring($idx + 1).Trim() }
        }
    }
    return $cfg
}

# --- Configuration : sap.env, complete par backend\.env pour le mot de passe
$cfg = Read-EnvFile (Join-Path $PSScriptRoot "sap.env")
if ([string]::IsNullOrEmpty($cfg["SAP_PASSWD"])) {
    $back = Read-EnvFile (Join-Path (Split-Path $PSScriptRoot -Parent) "backend\.env")
    $cfg["SAP_PASSWD"] = $back["SAP_PASSWD"]
}
if ([string]::IsNullOrEmpty($cfg["SAP_PASSWD"])) { throw "Mot de passe SAP introuvable (sap.env et backend\.env)." }

# --- Connexion NCo
[Reflection.Assembly]::Load("sapnco_utils, Version=3.1.0.42, Culture=neutral, PublicKeyToken=50436dca5c7f7d23") | Out-Null
[Reflection.Assembly]::Load("sapnco, Version=3.1.0.42, Culture=neutral, PublicKeyToken=50436dca5c7f7d23") | Out-Null

$C = [SAP.Middleware.Connector.RfcConfigParameters]
$p = New-Object SAP.Middleware.Connector.RfcConfigParameters
$p.Add($C::Name,          "TAUX")
$p.Add($C::AppServerHost, $cfg["SAP_ASHOST"])
$p.Add($C::SystemNumber,  $cfg["SAP_SYSNR"])
$p.Add($C::Client,        $cfg["SAP_CLIENT"])
$p.Add($C::User,          $cfg["SAP_USER"])
$p.Add($C::Password,      $cfg["SAP_PASSWD"])
$p.Add($C::Language,      $cfg["SAP_LANG"])

Write-Host ("Connexion a {0} (sysnr {1}, mandant {2}) en tant que {3}..." -f `
    $cfg["SAP_ASHOST"], $cfg["SAP_SYSNR"], $cfg["SAP_CLIENT"], $cfg["SAP_USER"]) -ForegroundColor Cyan
$script:dest = [SAP.Middleware.Connector.RfcDestinationManager]::GetDestination($p)
$script:dest.Ping()
Write-Host "PING OK" -ForegroundColor Green

# --- RFC_READ_TABLE generique. Emet les lignes dans le pipeline (pas de
#     tableau retourne : un `return ,$tab` se fait aplatir par Select-Object).
function Read-Table {
    param([string]$Table, [string[]]$Fields, [string[]]$Options = @(), [int]$RowCount = 200)

    $func = $script:dest.Repository.CreateFunction("RFC_READ_TABLE")
    $func.SetValue("QUERY_TABLE", $Table)
    $func.SetValue("DELIMITER", "|")
    $func.SetValue("ROWCOUNT", $RowCount)

    $tf = $func.GetTable("FIELDS")
    foreach ($f in $Fields) { $tf.Append() | Out-Null; $tf.SetValue("FIELDNAME", $f) }

    if ($Options.Count -gt 0) {
        $to = $func.GetTable("OPTIONS")
        # Chaque ligne d'OPTIONS est limitee a 72 caracteres cote SAP.
        foreach ($o in $Options) { $to.Append() | Out-Null; $to.SetValue("TEXT", $o) }
    }

    $func.Invoke($script:dest)

    $data = $func.GetTable("DATA")
    for ($r = 0; $r -lt $data.RowCount; $r++) {
        $data.CurrentIndex = $r
        $parts = $data.GetString("WA").Split("|")
        $o = [ordered]@{}
        for ($i = 0; $i -lt $Fields.Count; $i++) {
            $o[$Fields[$i]] = if ($i -lt $parts.Count) { $parts[$i].Trim() } else { "" }
        }
        [pscustomobject]$o          # emis, pas accumule
    }
}

# GDATU de TCURR/TCURF est stocke INVERSE : 99999999 - AAAAMMJJ.
function Convert-Gdatu([string]$g) {
    if ([string]::IsNullOrWhiteSpace($g)) { return "" }
    try {
        $s = (99999999 - [int]$g).ToString("00000000")
        return ("{0}-{1}-{2}" -f $s.Substring(0,4), $s.Substring(4,2), $s.Substring(6,2))
    } catch { return $g }
}

# UKURS : SAP suffixe le negatif ('0.94000-'). Negatif = cotation INDIRECTE.
#
# ⚠️ PIEGE RFC_READ_TABLE : le champ est rendu sur une largeur FIXE (9 car. pour
# UKURS). Une valeur plus large est rendue avec des '*' ('*77.00000' pour
# 1477,00000) : la donnee est PERDUE, pas juste mal cadree. Tout cours >= 1000
# est donc illisible par ce chemin -- raison pour laquelle un import de
# production doit passer par BAPI_EXCHANGERATE_GETDETAIL et non par
# RFC_READ_TABLE.
function Convert-Ukurs([string]$u) {
    $t = $u.Trim()
    if ($t.Contains("*")) {
        return [pscustomobject]@{ Taux = [double]::NaN; Indirect = $false; Tronque = $true; Brut = $t }
    }
    $indirect = $t.EndsWith("-")
    $val = [double]($t.TrimEnd("-"))
    return [pscustomobject]@{ Taux = $val; Indirect = $indirect; Tronque = $false; Brut = $t }
}

$listeDevises = ($Devises.Split(",") | ForEach-Object { "'" + $_.Trim().ToUpper() + "'" }) -join ","

# --- 1) Correspondance devise SAP <-> code ISO  (LE point cle)
Write-Host "`n=== TCURC : devise SAP -> code ISO ===" -ForegroundColor Cyan
Write-Host "  (c'est ici qu'on apprend que le 'FCFA' de NPG est l'ISO 'XOF')" -ForegroundColor DarkGray
try {
    Read-Table -Table "TCURC" -Fields @("WAERS","ISOCD","ALTWR") -RowCount 400 |
        Where-Object { $_.ISOCD -eq "XOF" -or $Devises.ToUpper().Split(",") -contains $_.WAERS } |
        Format-Table -AutoSize
} catch { Write-Host ("Lecture TCURC impossible : " + $_.Exception.Message) -ForegroundColor Yellow }

# --- 2) Types de cours
Write-Host "`n=== TCURV : types de cours definis ===" -ForegroundColor Cyan
try {
    Read-Table -Table "TCURV" -Fields @("KURST","XINVR","BWAER","XEURO") -RowCount 50 |
        Format-Table -AutoSize
} catch { Write-Host ("Lecture TCURV impossible : " + $_.Exception.Message) -ForegroundColor Yellow }

# --- 3) Facteurs de conversion (attendu : 1:1 sur les couples NPG)
Write-Host "`n=== TCURF : facteurs, type $TypeCours ===" -ForegroundColor Cyan
try {
    Read-Table -Table "TCURF" -Fields @("KURST","FCURR","TCURR","GDATU","FFACT","TFACT") `
               -Options @("FCURR IN ($listeDevises)") -RowCount 200 |
        Where-Object { $_.KURST -eq $TypeCours -or $_.FFACT -ne "1" -or $_.TFACT -ne "1" } |
        Select-Object KURST, FCURR, TCURR, @{n="DATE";e={ Convert-Gdatu $_.GDATU }}, FFACT, TFACT |
        Sort-Object FCURR, TCURR | Format-Table -AutoSize
} catch { Write-Host ("Lecture TCURF impossible : " + $_.Exception.Message) -ForegroundColor Yellow }

# --- 4) Les cours, du plus recent au plus ancien, parasites signales
Write-Host "`n=== TCURR : cours type '$TypeCours' pour $Devises ===" -ForegroundColor Cyan
try {
    $rows = @(
        Read-Table -Table "TCURR" -Fields @("KURST","FCURR","TCURR","GDATU","UKURS") `
                   -Options @("KURST = '$TypeCours' AND FCURR IN ($listeDevises)") -RowCount $MaxLignes |
            ForEach-Object {
                $k = Convert-Ukurs $_.UKURS
                [pscustomobject]@{
                    FCURR    = $_.FCURR
                    TCURR    = $_.TCURR
                    DATE     = Convert-Gdatu $_.GDATU
                    TAUX     = if ($k.Tronque) { $k.Brut } else { $k.Taux }
                    COTATION = if ($k.Indirect) { "INDIRECTE" } else { "directe" }
                    ETAT     = if ($k.Tronque) { "!! TRONQUE par RFC_READ_TABLE" }
                               elseif ($k.Taux -eq 0) { "!! TAUX A ZERO" }
                               elseif ($k.Taux -eq 0.94) { "!! demo SAP" }
                               else { "" }
                }
            }
    )
    Write-Host ("{0} ligne(s) rapatriee(s) (plafond {1})" -f $rows.Count, $MaxLignes) -ForegroundColor DarkGray

    Write-Host "`n-- Cours le plus recent par couple de devises --" -ForegroundColor Green
    $rows | Where-Object { $_.ETAT -eq "" } | Group-Object FCURR, TCURR | ForEach-Object {
        $_.Group | Sort-Object DATE -Descending | Select-Object -First 1
    } | Sort-Object FCURR, TCURR | Format-Table -AutoSize

    $pourris = @($rows | Where-Object { $_.ETAT -ne "" })
    if ($pourris.Count -gt 0) {
        Write-Host "-- Lignes a NE PAS importer telles quelles --" -ForegroundColor Yellow
        $pourris | Sort-Object FCURR, TCURR, DATE | Format-Table -AutoSize
    }

    Write-Host "-- 15 cours les plus recents (tous couples) --" -ForegroundColor DarkGray
    $rows | Sort-Object DATE -Descending | Select-Object -First 15 | Format-Table -AutoSize
} catch { Write-Host ("Lecture TCURR impossible : " + $_.Exception.Message) -ForegroundColor Yellow }

Write-Host "`nTermine (lecture seule, aucune ecriture SAP)." -ForegroundColor Green
