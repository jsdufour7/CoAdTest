import Link from "next/link";

import { ChevronRight, MapPin, Sparkles } from "lucide-react";

import {
  LANGUAGE_LABELS,
  SPECIALTY_LABELS,
} from "@coadvisor/marketplace";
import type {
  MarketplaceLanguage,
  PublicProfileCard,
} from "@coadvisor/marketplace";
import { Avatar, Badge, Card, CardContent } from "@coadvisor/ui";

/**
 * Carte conseiller (annuaire + recommandations) — une seule source de
 * vérité visuelle (Règle kit, pas de duplication).
 */
export function AdvisorCard({
  profile,
  matchScore,
  reasons,
  hrefSuffix = "",
}: {
  profile: PublicProfileCard;
  matchScore?: number;
  reasons?: string[];
  hrefSuffix?: string;
}) {
  const href = `/conseillers/${profile.profileId}${hrefSuffix}`;
  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 pt-5">
        <div className="flex items-start gap-3">
          {profile.photoUrl ?? profile.photoData ? (
            // photo servie depuis le coffre chiffré (Sprint 8) ; repli
            // data URL pour les profils non encore migrés
            <img
              src={profile.photoUrl ?? profile.photoData!}
              alt={`Photo de ${profile.displayName}`}
              className="h-12 w-12 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <Avatar name={profile.displayName} size="lg" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {profile.displayName}
            </p>
            <p className="truncate text-sm text-slate-500">{profile.firmName}</p>
            {matchScore !== undefined ? (
              <Badge variant="brand" className="mt-1">
                Adéquation {matchScore}/100
              </Badge>
            ) : null}
          </div>
        </div>

        {profile.headline ? (
          <p className="text-sm leading-snug text-slate-700">{profile.headline}</p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {profile.specialties.slice(0, 3).map((specialty) => (
            <Badge key={specialty} variant="outline">
              {SPECIALTY_LABELS[specialty]}
            </Badge>
          ))}
          {profile.specialties.length > 3 ? (
            <Badge variant="neutral">+{profile.specialties.length - 3}</Badge>
          ) : null}
        </div>

        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {profile.regions.join(", ")} ·{" "}
          {profile.languages
            .map((l) => LANGUAGE_LABELS[l as MarketplaceLanguage] ?? l)
            .join(", ")}
          {profile.yearsExperience !== null
            ? ` · ${profile.yearsExperience} ans d'expérience`
            : ""}
        </p>

        {reasons && reasons.length > 0 ? (
          <div className="rounded-lg bg-brand-50/60 px-3 py-2">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-800">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Recommandé parce que
            </p>
            <ul className="space-y-0.5">
              {reasons.map((reason, index) => (
                <li key={index} className="text-xs text-brand-900/80">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Voir le profil
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
