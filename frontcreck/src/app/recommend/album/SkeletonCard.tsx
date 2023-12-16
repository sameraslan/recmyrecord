'use client';

import { Box, Skeleton, Center } from '@chakra-ui/react';
import { motion } from 'framer-motion';

interface SkeletonCardProps {
  isMain?: boolean;
}

const MotionBox = motion(Box);

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ isMain }) => {
  const mb = isMain ? 20 : 6;
  const mt = isMain ? 20 : 0;

  return (
    <Center width="full" px={6} mb={mb} mt={mt}>
      <MotionBox
        padding="6"
        boxShadow="lg"
        bg="white"
        w="240px"
        h="300px"
        borderRadius="lg"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        <Skeleton
          startColor="gray.400"
          endColor="gray.500"
          height="60%"
          borderRadius="lg"
        />
        <Skeleton
          startColor="gray.400"
          endColor="gray.400"
          height="40%"
          mt="4"
        />
      </MotionBox>
    </Center>
  );
};
