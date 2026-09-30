import { HomeHero } from '@/components/home/HomeHero';
import { Shelf } from '@/components/home/Shelf';
import { SHELF_SIZE } from '@/lib/data/catalog';
import { getShelf } from '@/lib/data/server';

export default function HomePage() {
  return (
    <section className="home" aria-labelledby="home-h">
      <HomeHero />
      <Shelf albums={getShelf(SHELF_SIZE)} />
    </section>
  );
}
