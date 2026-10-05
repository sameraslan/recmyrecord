import { COPY } from '@/lib/copy';

export function NoWebGL() {
  return (
    <div className="map-msg" role="note">
      <p>{COPY.map.noWebgl}</p>
      <p>{COPY.map.noWebglHint}</p>
    </div>
  );
}
