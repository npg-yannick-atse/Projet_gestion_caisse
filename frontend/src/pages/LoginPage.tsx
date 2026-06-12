import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useLogin } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';

const schema = z.object({
  identifiant: z.string().min(1, 'Identifiant requis'),
  motDePasse: z.string().min(1, 'Mot de passe requis'),
});

type FormValues = z.infer<typeof schema>;

const fieldClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white pl-9 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate({ ...values, plateforme: 'WEB' }, {
      onSuccess: (data) => {
        setSession(data.user, data.accessToken, data.refreshToken);
        navigate({ to: '/' });
      },
    });
  });

  const serverError =
    loginMutation.error instanceof AxiosError
      ? ((loginMutation.error.response?.data as { message?: string })?.message ?? 'Identifiants invalides')
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* Liseré marine */}
          <div className="h-1.5 bg-primary" />

          <div className="p-8">
            <div className="mb-7 flex flex-col items-center text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-md border border-slate-200 bg-white">
                <img src="/logo-npg.png" alt="NPG Gandour" className="h-12 w-12 object-contain" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Fond de Caisse</h1>
              <p className="mt-0.5 text-sm text-slate-500">NPG Gandour — Espace de gestion</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="identifiant" className="text-sm font-medium text-slate-700">
                  Identifiant LDAP
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="identifiant"
                    autoComplete="username"
                    placeholder="prenom.nom"
                    className={fieldClass}
                    {...register('identifiant')}
                  />
                </div>
                {errors.identifiant && <p className="text-sm text-red-600">{errors.identifiant.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="motDePasse" className="text-sm font-medium text-slate-700">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="motDePasse"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`${fieldClass} pr-10`}
                    {...register('motDePasse')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.motDePasse && <p className="text-sm text-red-600">{errors.motDePasse.message}</p>}
              </div>

              {serverError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginMutation.isPending ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Connexion sécurisée via l'annuaire NPG (LDAP)
        </p>
      </div>
    </div>
  );
}
