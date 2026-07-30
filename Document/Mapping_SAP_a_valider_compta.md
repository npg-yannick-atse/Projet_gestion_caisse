# Mapping comptable SAP — à valider par la comptabilité

Contexte : chaque opération de l'appli Fond de Caisse est envoyée à SAP (plan **PCGG**, société **2251**) via une pièce comptable en partie double. Le tableau ci-dessous indique, pour chaque **type de compte** de l'appli, le **compte PCGG** actuellement utilisé. Merci de **confirmer ou corriger** chaque ligne.

| Type (appli) | Compte PCGG actuel | Libellé SAP | À confirmer ? |
|---|---|---|---|
| **CAISSE** (espèces) | `57101000` | CAISSE SIÈGE SOCIAL EN FCFA | Probablement OK |
| **PORTEFEUILLE** (banque) | `52101000` | Banque SGBCI | ⚠️ Est-ce la bonne banque par défaut ? |
| **RECETTE** (encaissement) | `72130000` | VENTE DIVERS | ⚠️ À confirmer |
| **CHARGE** (décaissement) | `62620000` | FOURNITURES INFORMATIQUES | 🔴 **Problème** — voir ci-dessous |
| **CREDIT_EMPLOYE** (crédit/avance) | `42110000` | PERSONNEL, AVANCES | Probablement OK |
| **GAIN_CHANGE** | `77610000` | GAINS DE CHANGE | OK |
| **PERTE_CHANGE** | `67610000` | PERTE DE CHANGE | OK |

## 🔴 Point bloquant : le compte de CHARGE
`62620000` = **« Fournitures informatiques »** est un compte **spécifique**. S'il sert de compte de charge par défaut, **tous les décaissements** seront imputés à « Fournitures informatiques », ce qui est faux.

**Deux options — que préfère la compta ?**
1. **Un compte de charge générique** par défaut → lequel ? (ex. 62xxxxxx « Autres charges », 60xxxxxx « Achats »…)
2. **Imputer chaque décaissement sur le compte de sa nature comptable** : dans l'appli, chaque nature (Billet d'avion, Achat flacon, Rechargement internet…) est déjà rattachée à un compte PCGG précis (ex. Billet d'avion → `62121000` Voyages et déplacements). → **recommandé** : la pièce SAP porterait le vrai compte de charge selon l'opération, plus juste comptablement.

## Questions annexes
- **Sens débit/crédit** : la convention interne de l'appli est `solde = Σcrédit − Σdébit` (miroir de SAP) ; l'envoi inverse déjà débit/crédit pour SAP. À valider sur une pièce test.
- **Société / domaine** : société `2251`, domaine analytique `2251`. Correct ?
- **Centres de coût** : seuls `22100-DSI`, `33100-DUS`, `41100-DVR` sont utilisés (identiques dans SAP). OK ?
