import { Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';
import { parseDedupedClaimList } from '../../../../../shared/parse-claim-list';

interface UnverifiedClaimsCardProps {
  specialties?: unknown;
  procedure?: unknown;
  capability?: unknown;
  equipment?: unknown;
}

export function UnverifiedClaimsCard({
  specialties,
  procedure,
  capability,
  equipment,
}: UnverifiedClaimsCardProps) {
  const specialtyItems = parseDedupedClaimList(specialties);
  const procedureItems = parseDedupedClaimList(procedure);
  const capabilityItems = parseDedupedClaimList(capability);
  const equipmentItems = parseDedupedClaimList(equipment);

  const hasClaims =
    specialtyItems.length > 0 ||
    procedureItems.length > 0 ||
    capabilityItems.length > 0 ||
    equipmentItems.length > 0;

  if (!hasClaims) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Facility-reported claims</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          These items come from the Virtue Foundation dataset and are not independently verified.
        </p>
        <ClaimGroup title="Specialties" items={specialtyItems} />
        <ClaimGroup title="Procedures" items={procedureItems} />
        <ClaimGroup title="Capabilities" items={capabilityItems} />
        <ClaimGroup title="Equipment" items={equipmentItems} />
      </CardContent>
    </Card>
  );
}

function ClaimGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h4>
      <ul className="list-disc pl-5 space-y-1 break-words">
        {items.map((item) => (
          <li key={`${title}-${item}`}>
            {item}
            <span className="sr-only"> — unverified</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
