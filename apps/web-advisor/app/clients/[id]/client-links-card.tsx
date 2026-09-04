"use client";

/**
 * Carte « Liens certifiés » — Sprint 7c (correctif 4).
 *
 * Le conseiller certifie lui-même les liens entre fiches (couple, famille,
 * associés, procuration…). Chaque lien est :
 *   - symétrique (visible des deux côtés),
 *   - navigable (clic → fiche de l'autre client),
 *   - audité (création ET retrait consignés au registre).
 */

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  Alert,
  Avatar,
  Badge,
  Button,
  nativeSelectClass,
  TextField,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import { Link2, Trash2 } from "lucide-react";

import {
  createClientLinkAction,
  deleteClientLinkAction,
} from "../actions";
import type { ClientLinkActionState } from "../actions";

export interface ClientLinkItem {
  id: string;
  type: string;
  note: string | null;
  otherClientId: string;
  otherClientName: string;
  createdByName: string;
}

export interface ClientLinkCandidate {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  CONJOINT: "Conjoint·e",
  FAMILLE: "Famille",
  AFFAIRES: "Associé·e / affaires",
  PROCURATION: "Procuration",
  AUTRE: "Autre lien",
};

const TYPE_BADGES: Record<string, BadgeVariant> = {
  CONJOINT: "brand",
  FAMILLE: "success",
  AFFAIRES: "warning",
  PROCURATION: "outline",
  AUTRE: "neutral",
};

function RemoveLinkButton({
  clientId,
  linkId,
}: {
  clientId: string;
  linkId: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<ClientLinkActionState> =>
      deleteClientLinkAction(clientId, linkId),
    {} as ClientLinkActionState,
  );

  return (
    <form action={formAction} className="shrink-0">
      {state.error ? (
        <span className="mr-1 text-xs text-red-600">{state.error}</span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        data-testid={`client-link-remove-${linkId}`}
        title="Retirer ce lien (le retrait est consigné au registre)"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Retirer le lien</span>
      </button>
    </form>
  );
}

export function ClientLinksCard({
  clientId,
  links,
  candidates,
  canWrite,
}: {
  clientId: string;
  links: ClientLinkItem[];
  candidates: ClientLinkCandidate[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (
      _prev: ClientLinkActionState,
      formData: FormData,
    ): Promise<ClientLinkActionState> =>
      createClientLinkAction(clientId, {
        otherClientId: String(formData.get("otherClientId") ?? ""),
        type: String(formData.get("type") ?? "") as
          | "CONJOINT"
          | "FAMILLE"
          | "AFFAIRES"
          | "PROCURATION"
          | "AUTRE",
        note: String(formData.get("note") ?? "").trim() || undefined,
      }),
    {} as ClientLinkActionState,
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const linkedIds = new Set(links.map((l) => l.otherClientId));
  const linkable = candidates.filter((c) => !linkedIds.has(c.id));

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <div className="space-y-4" data-testid="client-links-card">
      {links.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun lien certifié — reliez cette fiche à un conjoint, un associé ou
          un proche pour naviguer entre les dossiers.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center gap-3"
              data-testid={`client-link-row-${link.id}`}
            >
              <Avatar name={link.otherClientName} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/clients/${link.otherClientId}`}
                    data-testid={`client-link-nav-${link.otherClientId}`}
                    className="truncate text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
                  >
                    {link.otherClientName}
                  </Link>
                  <Badge variant={TYPE_BADGES[link.type] ?? "neutral"}>
                    {TYPE_LABELS[link.type] ?? link.type}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {link.note ? `${link.note} · ` : ""}
                  certifié par {link.createdByName}
                </p>
              </div>
              {canWrite ? (
                <RemoveLinkButton clientId={clientId} linkId={link.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        open ? (
          <form
            ref={formRef}
            action={formAction}
            className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5"
            data-testid="client-link-form"
          >
            {state.error ? <Alert variant="error">{state.error}</Alert> : null}

            <div className="space-y-1.5">
              <label
                htmlFor="link-otherClientId"
                className="block text-sm font-medium text-slate-700"
              >
                Fiche à relier
              </label>
              <select
                id="link-otherClientId"
                name="otherClientId"
                className={nativeSelectClass()}
                required
                defaultValue=""
                data-testid="client-link-select-other"
              >
                <option value="" disabled>
                  Choisir un client actif…
                </option>
                {linkable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="link-type"
                className="block text-sm font-medium text-slate-700"
              >
                Type de lien
              </label>
              <select
                id="link-type"
                name="type"
                className={nativeSelectClass()}
                required
                defaultValue="CONJOINT"
                data-testid="client-link-select-type"
              >
                <option value="CONJOINT">Conjoint·e</option>
                <option value="FAMILLE">Famille</option>
                <option value="AFFAIRES">Associé·e / affaires</option>
                <option value="PROCURATION">Procuration</option>
                <option value="AUTRE">Autre lien</option>
              </select>
            </div>

            <TextField
              id="link-note"
              name="note"
              label="Note (facultative)"
              maxLength={300}
              autoComplete="off"
              placeholder="Ex. : mariage 2019, comptes conjoints"
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={pending}
                disabled={linkable.length === 0}
                data-testid="client-link-submit"
              >
                Certifier le lien
              </Button>
            </div>
            {linkable.length === 0 ? (
              <p className="text-xs text-slate-400">
                Tous les clients actifs sont déjà reliés à cette fiche.
              </p>
            ) : null}
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
            data-testid="client-link-add-open"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Certifier un lien
          </Button>
        )
      ) : null}
    </div>
  );
}
