import { useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { CrowdHistogram, Legend, SeparationControl } from './charts';
import { getModel, separationReading, shares } from './model';
import { pageActions, usePage } from './store';

function Inner() {
  const { seed, separation } = usePage();
  const m = getModel(seed, separation);
  const g = useMemo(() => shares(m.goods), [m]);
  const b = useMemo(() => shares(m.bads), [m]);
  const max = Math.max(0.001, ...g, ...b);
  const summary = `Separation ${separation.toFixed(1)}. ${separationReading(separation)}.`;
  return (
    <>
      <CrowdHistogram
        goods={g}
        bads={b}
        max={max}
        height={250}
        ariaLabel={`Overlapping score histograms of goods and bads. ${summary}`}
      />
      <Legend
        goods="Goods (repaid), as % of all goods"
        bads="Bads (defaulted), as % of all bads"
      />
      <div className="mt-3">
        <SeparationControl />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.reset}>Reset</Button>
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function SeparationLab() {
  return (
    <ClientOnly
      minHeight={440}
      label="Two crowds: drag goods and bads closer together and watch the overlap grow"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
