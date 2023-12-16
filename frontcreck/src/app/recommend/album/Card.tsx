'use client';

import {
  Box,
  Center,
  useColorModeValue,
  Heading,
  Text,
  Stack,
  Image,
  Tooltip,
} from '@chakra-ui/react';
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
} from 'framer-motion';

import { Album } from './SearchBar';
import { useEffect } from 'react';

const MotionBox = motion(Box);

interface CardProps {
  album: Album;
  isMain?: boolean;
}

export const Card: React.FC<CardProps> = ({ album, isMain }) => {
  const scale = useMotionValue(1);
  const shadowY = useTransform(scale, [1, 1.1], [0, 12]);
  const bg = useColorModeValue(isMain ? 'orange.300' : 'white', 'gray.800');
  const mb = isMain ? 20 : 6;
  const mt = isMain ? 20 : 0;
  const controls = useAnimation();

  useEffect(() => {
    controls.start({ opacity: 1, transition: { duration: 0.5 } });
  }, [controls]);

  return (
    <Center mb={mb} mt={mt}>
      <MotionBox
        initial={{ opacity: 0 }}
        animate={controls}
        onHoverStart={() =>
          controls.start({ scale: 1.1, transition: { duration: 0.3 } })
        }
        onHoverEnd={() =>
          controls.start({ scale: 1, transition: { duration: 0.3 } })
        }
        transition={{ duration: 0.3 }}
        style={{ scale, boxShadow: `0 ${shadowY}px 30px rgba(0, 0, 0, 0.3)` }}
        role={'group'}
        p={4}
        maxW={'240px'}
        w={'full'}
        bg={bg}
        boxShadow={'2xl'}
        rounded={'lg'}
        pos={'relative'}
        zIndex={1}
      >
        <Box
          rounded={'lg'}
          mt={-12}
          pos={'relative'}
          height={'auto'}
          _after={{
            transition: 'all .3s ease',
            content: '""',
            w: 'full',
            h: 'full',
            pos: 'absolute',
            top: 5,
            left: 0,
            backgroundImage: `url(${album.CoverURL})`,
            filter: 'blur(15px)',
            zIndex: -1,
          }}
          _groupHover={{
            _after: {
              filter: 'blur(20px)',
            },
          }}
        >
          <Image
            rounded={'lg'}
            height={'inherit'}
            width={'inherit'}
            objectFit={'cover'}
            src={album.CoverURL}
            alt={album.Title + ' ' + album.Artist}
          />
        </Box>
        <Stack pt={7} align={'center'} height="110px">
          <Text color={'gray.500'} fontSize={'xs'} textTransform={'uppercase'}>
            Album
          </Text>
          <Box maxW="100%">
            <Tooltip label={album.Title} placement="right">
              <Heading
                fontSize={'xl'}
                fontFamily={'body'}
                fontWeight={500}
                isTruncated
              >
                {album.Title}
              </Heading>
            </Tooltip>
          </Box>
          <Box maxW="100%">
            <Tooltip label={album.Artist} placement="right">
              <Text
                fontSize={'sm'}
                fontFamily={'body'}
                fontWeight={400}
                isTruncated
              >
                {album.Artist}
              </Text>
            </Tooltip>
          </Box>
        </Stack>
      </MotionBox>
    </Center>
  );
};
