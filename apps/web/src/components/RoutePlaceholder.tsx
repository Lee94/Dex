import { Placeholder } from '@/components/Placeholder';
import { useT, type Dict } from '@/i18n';

/**
 * A not-yet-built view: a translated Blueprint NonIdealState. `tkey` indexes the
 * i18n `placeholders` namespace; the subtitle is the shared "nothing here yet".
 * Kept in its own file so `router.tsx` exports only the route table (Fast Refresh).
 */
export function RoutePlaceholder({
  icon,
  tkey,
}: {
  icon: string;
  tkey: keyof Dict['placeholders'];
}) {
  const t = useT();
  return <Placeholder icon={icon} title={t.placeholders[tkey]} subtitle={t.common.nothingHere} />;
}
