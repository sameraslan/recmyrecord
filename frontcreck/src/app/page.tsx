import { COPY } from '@/lib/copy';

export default function HomePage() {
  return (
    <section className="home" aria-labelledby="home-h">
      <div className="hero">
        <h1 id="home-h" tabIndex={-1}>
          {COPY.hero}
        </h1>
        <p className="lede">{COPY.heroSub}</p>
      </div>
    </section>
  );
}
