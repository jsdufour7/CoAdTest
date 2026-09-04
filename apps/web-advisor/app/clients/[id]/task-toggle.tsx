"use client";

import { useFormStatus } from "react-dom";
import { Check, Undo2 } from "lucide-react";

import { cn, Spinner } from "@coadvisor/ui";

interface TaskToggleButtonProps {
  clientId: string;
  taskId: string;
  done: boolean;
  /** Action serveur liée (clientId, taskId, statut cible). */
  action: () => Promise<void>;
}

function SubmitIcon({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  if (pending) {
    return <Spinner aria-hidden="true" className="h-3.5 w-3.5" />;
  }
  const Icon = done ? Undo2 : Check;
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
}

/**
 * Bouton de bascule d'une tâche (À faire ↔ Complétée).
 * L'état est soumis via un formulaire serveur — fonctionne sans JS client
 * (progressive enhancement), le spinner n'apparaît qu'avec JS.
 */
export function TaskToggleButton({ done, action }: TaskToggleButtonProps) {
  return (
    <form action={action}>
      <button
        type="submit"
        aria-label={done ? "Rouvrir la tâche" : "Marquer comme complétée"}
        title={done ? "Rouvrir la tâche" : "Marquer comme complétée"}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
          done
            ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
            : "border-slate-300 bg-white text-slate-400 hover:border-emerald-500 hover:text-emerald-500",
        )}
      >
        <SubmitIcon done={done} />
      </button>
    </form>
  );
}
