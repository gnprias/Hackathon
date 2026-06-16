import { useMemo } from 'react';
import { EMPTY_FIELD } from '../../../../../shared/format-field-value';
import { parseDedupedClaimList } from '../../../../../shared/parse-claim-list';

interface ClaimBulletListProps {
  label: string;
  value: unknown;
}

export function ClaimBulletList({ label, value }: ClaimBulletListProps) {
  const items = useMemo(() => parseDedupedClaimList(value), [value]);

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {items.length === 0 ? (
        <dd className="text-sm">{EMPTY_FIELD}</dd>
      ) : (
        <dd className="text-sm">
          <ul className="list-disc pl-5 space-y-1 break-words">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </dd>
      )}
    </div>
  );
}
