import { useId, useRef } from 'react';
import { ticks } from 'd3-array';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import {
  CELL_STYLE,
  CutoffAxis,
  CutoffHandle,
  CutoffSlider,
  FlaggedBand,
  GOOD_FILL,
  MailLegend,
  PAD,
  ShareSlider,
  SpamHatch,
  W,
  count,
  pct,
  whole,
  xOf,
} from './charts';
import { N_SMALL, getMail } from './mail';
import { FLAG_NOTHING, pageActions, usePage } from './store';
import { metrics } from './threshold';

const H = 300;
const TOP = 34;
const BASE = 236;

function Cell({
  kind,
  title,
  tech,
  n,
}: {
  kind: keyof typeof CELL_STYLE;
  title: string;
  tech: string;
  n: number;
}) {
  return (
    <td className="border-2 p-2 align-top" style={CELL_STYLE[kind]}>
      <div className="text-sm font-semibold leading-tight">{title}</div>
      <div className="text-xs text-muted">{tech}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{count(n)}</div>
    </td>
  );
}

function Inner() {
  const { seed, cutoff, share } = usePage();
  const mail = getMail(seed, N_SMALL, share);
  const svgRef = useRef<SVGSVGElement>(null);
  const hatch = useId();

  const row = mail.curve[cutoff]!;
  const m = metrics(row);
  const none = mail.curve[FLAG_NOTHING]!;
  const baseAcc = metrics(none).accuracy ?? 0;
  const acc = m.accuracy ?? 0;
  const flagged = row.tp + row.fp;

  const yTicks = ticks(0, mail.hist.max, 4);
  const yTop = yTicks[yTicks.length - 1]!;
  const yOf = (v: number) => BASE - (v / yTop) * (BASE - TOP - 12);
  const barW = (W - PAD.l - PAD.r) / (FLAG_NOTHING / 5);

  const reading =
    flagged === 0
      ? `${cutoff >= FLAG_NOTHING ? 'Flag nothing' : `Cutoff ${cutoff}`}: you flag no emails, so accuracy is ${pct(acc)} and spam caught is 0.`
      : `${cutoff <= 0 ? 'Flag everything' : `Cutoff ${cutoff}`}: you flag ${count(flagged)} of ${mail.n} emails. ${count(row.tp)} are spam (caught), ${count(row.fp)} are good mail (false alarms). ${count(row.fn)} spam slipped through. Accuracy ${pct(acc)}.`;
  const summary = `Cutoff ${cutoff}: caught ${row.tp} spam, missed ${row.fn}, ${row.fp} false alarms, ${row.tn} correctly passed. Accuracy ${pct(acc)}.`;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label={`Histogram of ${count(mail.n)} email scores, good mail and spam, with a cutoff at ${cutoff}`}
      >
        <defs>
          <SpamHatch id={hatch} />
        </defs>
        <FlaggedBand cutoff={cutoff} top={TOP} bottom={BASE} labelY={TOP + 22} />
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--color-grid)"
            />
            <text
              x={PAD.l - 6}
              y={yOf(v) + 6}
              textAnchor="end"
              fontSize="16"
              fill="var(--color-muted)"
            >
              {v}
            </text>
          </g>
        ))}
        <text x={PAD.l - 38} y={18} fontSize="16" fill="var(--color-muted)">
          number of emails
        </text>
        {mail.hist.good.map((v, i) => (
          <rect
            key={`g${i}`}
            x={xOf(i * 5) + 0.5}
            y={yOf(v)}
            width={barW - 1}
            height={Math.max(0, BASE - yOf(v))}
            fill={GOOD_FILL}
          />
        ))}
        {mail.hist.spam.map((v, i) => (
          <rect
            key={`s${i}`}
            x={xOf(i * 5) + 0.5}
            y={yOf(v)}
            width={barW - 1}
            height={Math.max(0, BASE - yOf(v))}
            fill={`url(#${hatch})`}
            stroke="var(--color-accent)"
            strokeWidth="1.2"
          />
        ))}
        <CutoffAxis y={BASE} />
        <CutoffHandle
          svgRef={svgRef}
          cutoff={cutoff}
          top={TOP}
          bottom={BASE}
          onChange={pageActions.setCutoff}
          label="Cutoff"
        />
      </svg>
      <MailLegend />

      <div className="mt-3">
        <CutoffSlider />
      </div>

      <table className="mt-3 w-full table-fixed border-separate border-spacing-1 text-left">
        <caption className="sr-only">Outcome table for the current cutoff</caption>
        <thead>
          <tr>
            <td className="w-[22%]" />
            <th scope="col" className="text-xs font-semibold text-muted">
              Flagged
            </th>
            <th scope="col" className="text-xs font-semibold text-muted">
              Not flagged
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="text-xs font-semibold leading-tight text-muted">
              Really spam
              <div className="font-normal">{count(mail.spam)}</div>
            </th>
            <Cell kind="caught" title="Caught spam" tech="true positive" n={row.tp} />
            <Cell kind="missed" title="Missed spam" tech="false negative" n={row.fn} />
          </tr>
          <tr>
            <th scope="row" className="text-xs font-semibold leading-tight text-muted">
              Really good
              <div className="font-normal">{count(mail.good)}</div>
            </th>
            <Cell
              kind="falseAlarm"
              title="False alarm"
              tech="false positive"
              n={row.fp}
            />
            <Cell
              kind="passed"
              title="Correctly passed"
              tech="true negative"
              n={row.tn}
            />
          </tr>
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Metric
          label="Accuracy"
          value={pct(acc)}
          hint={`${whole(acc * 100)} of every 100 emails sorted correctly`}
          tone="accent"
          wrap
        />
        <Metric
          label="Flag nothing scores"
          value={pct(baseAcc)}
          hint="accuracy if every email passes"
          tone="muted"
          wrap
        />
      </div>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        <span className="text-muted">What you&apos;re seeing: </span>
        {reading}
      </p>
      {acc < baseAcc && (
        <p
          className="m-0 mt-2 rounded-md border-2 border-neg px-3 py-2 text-sm"
          role="note"
        >
          <span aria-hidden="true">⚠ </span>
          Flagging nothing scores higher than this filter does. Accuracy hides the
          problem.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => pageActions.setCutoff(FLAG_NOTHING)}>
          Flag nothing
        </Button>
        <Button onClick={pageActions.reset}>Reset</Button>
        <Button onClick={pageActions.newMail}>New mail</Button>
      </div>
      <div className="mt-3 border-t border-grid pt-3">
        <ShareSlider />
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function SlideTheThreshold() {
  return (
    <ClientOnly
      minHeight={900}
      label="Slide the cutoff over 2000 emails and watch the four outcomes change"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
