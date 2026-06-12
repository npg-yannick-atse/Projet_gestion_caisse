# Design System / Template — Fond de Caisse

Ce document décrit **l'apparence complète** de l'application (couleurs, typographie, composants) et donne tout le code nécessaire pour **réutiliser ce template** dans un autre projet React + Vite + Tailwind.

> Stack : **Vite + React 19 + TypeScript + Tailwind CSS 3**. Icônes **lucide-react**. Variantes via **class-variance-authority (cva)**. Pas de thème acheté — tout est fait maison.

---

## 1. Identité visuelle

### Couleurs de marque (utilisées en dur dans les composants)

| Rôle | Hex | Usage |
|------|-----|-------|
| **Bleu primaire** | `#0F4C81` | Boutons principaux, titres, bordures de marque |
| **Bleu clair** | `#1A6DB5` | Survols, accents, badges |
| **Vert marque** | `#00C896` | Accent positif, portefeuilles, icônes succès |
| **Vert texte** | `#059669` | Texte sur pastilles « succès » |
| **Ambre** | `#F59E0B` / `#D97706` | Avertissements, états « en attente » |
| **Rouge** | `#EF4444` | Erreurs, suppression, danger |
| **Violet** | `#7C3AED` | Catégorie / accent secondaire |
| **Noir titre** | `#0F172A` | Titres, valeurs chiffrées |
| **Gris texte** | `#64748B` | Texte secondaire / labels |
| **Gris clair** | `#94A3B8` | Texte tertiaire, placeholders |

### Fonds de pastilles (chips par tonalité)

| Tonalité | Fond | Texte |
|----------|------|-------|
| blue | `#EFF6FF` | `#1A6DB5` |
| green | `#ECFDF5` | `#059669` |
| amber | `#FFFBEB` | `#D97706` |
| red | `#FEF2F2` | `#EF4444` |
| purple | `#F5F3FF` | `#7C3AED` |
| gray | `#F8FAFC` | `#64748B` |

### Bordures & ombres

- Bordure de marque : `rgba(15,76,129,0.1)` (panneaux), `rgba(15,76,129,0.07)` (séparateurs internes)
- Ombre au survol des cartes : `0 6px 20px rgba(15,76,129,0.1)`
- Rayons : panneaux `13px`, cartes/chips `9px`, `--radius` global `0.75rem` (12px)

### Typographie

- **Corps** : `DM Sans` (poids 300/400/500/600/700)
- **Display / titres / chiffres** : `Space Grotesk` (classe `font-display`)
- Tailles repères : valeur stat `26px` bold, titre panneau `12px` semibold, label `10px` uppercase `tracking-[0.7px]`, texte courant `11px`–`14px`.

---

## 2. Tokens — fichiers à copier

### `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Space Grotesk', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

### `src/index.css` (variables CSS + base)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 208 79% 28%;            /* ≈ #0F4C81 */
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;  /* ≈ #64748B */
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;      /* ≈ #EF4444 */
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;       /* ≈ #E2E8F0 */
    --input: 214.3 31.8% 91.4%;
    --ring: 208 79% 28%;
    --radius: 0.75rem;
  }

  * { @apply border-border; }

  body {
    @apply bg-background text-foreground font-sans;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

### `src/lib/utils.ts` (helper `cn`)

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Dépendances : `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`.

---

## 3. Polices

Les polices sont **auto-hébergées** dans `public/fonts/` (`DM Sans` + `Space Grotesk` en `.woff2`), chargées via `<link rel="stylesheet" href="/fonts/fonts.css" />` dans `index.html`.

**Option simple** (CDN) si tu pars d'un nouveau projet, mets dans `index.html` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

**Option self-hosted** (comme ici) : copier le dossier `public/fonts/` tel quel.

---

## 4. Composants UI (`src/components/ui/`)

### Button — `button.tsx`

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-10 px-4 py-2', sm: 'h-9 rounded-md px-3', lg: 'h-11 rounded-md px-8', icon: 'h-10 w-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';
export { Button, buttonVariants };
```

### Panel / PanelHeader — `panel.tsx`

Le conteneur signature de l'app : carte blanche, rayon `13px`, bordure bleutée, en-tête avec titre `font-display` + badge pilule.

```tsx
import { cn } from '@/lib/utils';

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white', className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, badge, children }: {
  title: React.ReactNode; badge?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3.5">
      <div className="font-display text-xs font-semibold text-[#0F172A]">{title}</div>
      {badge !== undefined && (
        <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">{badge}</span>
      )}
      {children}
    </div>
  );
}
```

### StatCard — `stat-card.tsx`

Carte de KPI : chip d'icône coloré, label uppercase, grande valeur `Space Grotesk`, micro-animation de survol.

```tsx
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatTone = 'blue' | 'green' | 'amber' | 'gray' | 'purple';

const TONES: Record<StatTone, { chip: string; icon: string }> = {
  blue: { chip: 'bg-[#EFF6FF]', icon: 'text-[#1A6DB5]' },
  green: { chip: 'bg-[#ECFDF5]', icon: 'text-[#00C896]' },
  amber: { chip: 'bg-[#FFFBEB]', icon: 'text-[#F59E0B]' },
  gray: { chip: 'bg-[#F8FAFC]', icon: 'text-[#64748B]' },
  purple: { chip: 'bg-[#F5F3FF]', icon: 'text-[#7C3AED]' },
};

export function StatCard({ tone = 'gray', icon: Icon, label, value, sub, to, children }: {
  tone?: StatTone; icon: LucideIcon; label: string; value: React.ReactNode;
  sub?: string; to?: string; children?: React.ReactNode;
}) {
  const t = TONES[tone];
  const body = (
    <div className="h-full rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(15,76,129,0.1)]">
      <div className={cn('mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px]', t.chip)}>
        <Icon className={cn('h-4 w-4', t.icon)} />
      </div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">{label}</div>
      <div className="font-display text-[26px] font-bold leading-none text-[#0F172A]">{value}</div>
      {sub && <div className="mt-[3px] text-[10px] text-[#64748B]">{sub}</div>}
      {children}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}
```

### Pill (badge à pastille) — `pill.tsx`

```tsx
import { cn } from '@/lib/utils';

export type PillTone = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'purple';

const TONES: Record<PillTone, { cls: string; dot: string }> = {
  green:  { cls: 'bg-[#ECFDF5] text-[#059669]', dot: 'bg-[#059669]' },
  amber:  { cls: 'bg-[#FFFBEB] text-[#D97706]', dot: 'bg-[#D97706]' },
  blue:   { cls: 'bg-[#EFF6FF] text-[#1A6DB5]', dot: 'bg-[#1A6DB5]' },
  red:    { cls: 'bg-[#FEF2F2] text-[#EF4444]', dot: 'bg-[#EF4444]' },
  gray:   { cls: 'bg-[#F8FAFC] text-[#64748B]', dot: 'bg-[#64748B]' },
  purple: { cls: 'bg-[#F5F3FF] text-[#7C3AED]', dot: 'bg-[#7C3AED]' },
};

export function Pill({ tone = 'gray', dot = true, children }: {
  tone?: PillTone; dot?: boolean; children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', t.cls)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}
```

### Input / Label — `input.tsx`, `label.tsx`

```tsx
// input.tsx
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className)} {...props} />
  ),
);

// label.tsx
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:opacity-70', className)} {...props} />
  ),
);
```

### Card (shadcn-like) — `card.tsx`

`Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter`, basés sur `rounded-lg border bg-card text-card-foreground shadow-sm` + `p-6`. (Standard, voir le fichier source.)

---

## 5. Patterns récurrents

- **Boutons-icônes carrés** : `h-7 w-7` (ou `h-6 w-6`), `rounded-md`, fond `bg-white/10` sur cartes sombres ou `bg-[#0F4C81]` sur fond clair ; survol coloré selon l'action (`hover:bg-red-500/40` pour supprimer, `hover:bg-[#F59E0B]/40` pour désactiver).
- **Bouton d'action principal** : `inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#1A6DB5]` + icône `<Plus className="h-4 w-4" />`.
- **Carte « caisse » (fond dégradé bleu)** : `bg-gradient-to-br from-[#0F4C81] to-[#1A6DB5] text-white`, valeurs en `font-display`.
- **Grilles** : `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`, padding de section `p-[18px]`.
- **Bannière d'alerte** : panneau dégradé bleu + chip d'icône `bg-white/10`.

---

## 6. Réutiliser ce template dans un nouveau projet — checklist

1. `npm create vite@latest mon-app -- --template react-ts`
2. Installer : `npm i tailwindcss@3 postcss autoprefixer clsx tailwind-merge class-variance-authority lucide-react` (+ `@tanstack/react-router` si tu utilises `StatCard` avec `to`).
3. `npx tailwindcss init -p` puis remplacer `tailwind.config.js` par celui du **§2**.
4. Coller le `src/index.css` du **§2** et l'importer dans `main.tsx`.
5. Ajouter les polices (**§3**) — CDN ou copier `public/fonts/`.
6. Copier `src/lib/utils.ts` (`cn`) puis le dossier `src/components/ui/` (button, panel, stat-card, pill, input, label, card).
7. Composer tes pages avec `Panel` + `PanelHeader` + `StatCard` + `Pill` en réutilisant la palette du **§1**.

> Tout est déjà présent dans ce repo sous [frontend/src/components/ui/](frontend/src/components/ui/), [frontend/tailwind.config.js](frontend/tailwind.config.js), [frontend/src/index.css](frontend/src/index.css) et [frontend/public/fonts/](frontend/public/fonts/) — tu peux copier ces fichiers tels quels.
