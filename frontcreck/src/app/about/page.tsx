import type { Metadata } from 'next';
import { AboutClose } from '@/components/AboutClose';
import { FocusOnMount } from '@/components/FocusOnMount';
import { COPY } from '@/lib/copy';

export const metadata: Metadata = { title: COPY.titles.about };

export default function AboutPage() {
  return (
    <div className="about-page">
      <article className="about" aria-labelledby="about-h">
        <AboutClose />
        <h1 id="about-h" tabIndex={-1}>
          {COPY.about.title}
        </h1>
        <p>{COPY.about.intro}</p>
        {COPY.about.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="cap about-h2">{section.heading}</h2>
            {section.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
        <p className="about-signoff">{COPY.about.signoff}</p>
        <p className="about-credits">{COPY.about.credits}</p>
      </article>
      <FocusOnMount selector="#about-h" />
    </div>
  );
}
