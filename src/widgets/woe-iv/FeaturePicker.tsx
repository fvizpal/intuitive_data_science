import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { FEATURES } from './features';
import type { RankedKey } from './features';

interface Props {
  keys: readonly RankedKey[];
  value: RankedKey;
  onChange: (key: RankedKey) => void;
  label?: string;
}

export function FeaturePicker({ keys, value, onChange, label = 'Feature' }: Props) {
  return (
    <SegmentedControl
      label={label}
      value={value}
      onChange={onChange}
      options={keys.map((k) => ({ value: k, label: FEATURES[k].label }))}
    />
  );
}
