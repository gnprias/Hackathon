import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Badge,
} from '@databricks/appkit-ui/react';
import type { DeactivatedFacility } from '../use-deactivated-facilities';

interface DeactivateFacilityCardProps {
  uniqueId: string;
  facilityName?: string | null;
  deactivation: DeactivatedFacility | null;
  onChanged: () => void;
}

export function DeactivateFacilityCard({
  uniqueId,
  facilityName,
  deactivation,
  onChanged,
}: DeactivateFacilityCardProps) {
  const [reason, setReason] = useState(deactivation?.reason ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/lakebase/deactivated-facilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId, reason: reason.trim() || undefined }),
      });
      if (!response.ok) {
        throw new Error('Failed to deactivate facility');
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/lakebase/deactivated-facilities/${encodeURIComponent(uniqueId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to reactivate facility');
      }
      setReason('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Record status
          {deactivation && <Badge variant="destructive">Deactivated</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Mark {facilityName ?? 'this facility'} inactive/hidden for this app. The source facilities table is
          read-only; deactivations are stored in Lakebase.
        </p>

        {deactivation && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <p>
              Deactivated {new Date(deactivation.deactivatedAt).toLocaleString()}
              {deactivation.deactivatedBy ? ` by ${deactivation.deactivatedBy}` : ''}.
            </p>
            {deactivation.reason && <p>Reason: {deactivation.reason}</p>}
          </div>
        )}

        {!deactivation && (
          <div className="space-y-2">
            <Label htmlFor="deactivate-reason">Reason (optional)</Label>
            <Input
              id="deactivate-reason"
              placeholder="e.g. Duplicate listing, permanently closed"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div className="text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
        )}

        <div className="flex flex-wrap gap-2">
          {deactivation ? (
            <Button variant="outline" onClick={() => void handleReactivate()} disabled={loading}>
              {loading ? 'Saving…' : 'Reactivate facility'}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => void handleDeactivate()} disabled={loading}>
              {loading ? 'Saving…' : 'Deactivate / hide'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
