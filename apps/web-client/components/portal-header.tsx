import { logoutAction } from "../app/espace/actions";
import { Avatar, Button, Logo } from "@coadvisor/ui";

/**
 * En-tête de l'espace particulier — partagé entre les pages portail
 * (tableau de bord, ouvrir-et-signer, documents).
 */
export function PortalHeader({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 lg:px-6">
        <Logo size={32} />
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <Avatar name={fullName} size="sm" />
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-slate-800">{fullName}</p>
            <p className="text-xs text-slate-500">{email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Se déconnecter
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
