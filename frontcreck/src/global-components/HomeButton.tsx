'use client';

import { IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { FaHome } from 'react-icons/fa';

export const HomeButton: React.FC = () => {
  const router = useRouter();

  const handleClick = () => {
    router.push('/');
  };

  return (
    <IconButton
      aria-label="Home"
      icon={<FaHome />}
      colorScheme="orange"
      variant="outline"
      onClick={handleClick}
      position="absolute"
      top="2%"
      left="2%"
      bg="white"
    />
  );
};
