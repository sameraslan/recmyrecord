'use client';

import styles from '../page.module.css'
import Image from 'next/image'
import mapImage from '../../../public/map.jpg'
import { HomeButton } from '@/src/global-components/HomeButton';



export default function MapPage() {

  return (
    <main className={styles.main}>
      <HomeButton />
      <Image
      src={mapImage}
      width={3228}
      height={1713}
      priority={true}
      alt="WOJEH"
    />
    </main>
  );
}
