'use client';

import {
  Flex,
  Container,
  Heading,
  Stack,
  Image,
  Text,
  Button,
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';

export default function CallToActionWithIllustration() {
  const router = useRouter();

  return (
    <Container maxW={'5xl'}>
      <Stack
        textAlign={'center'}
        align={'center'}
        spacing={{ base: 8, md: 10 }}
        py={{ base: 20, md: 28 }}
      >
        <Heading
          fontWeight={600}
          fontSize={{ base: '3xl', sm: '4xl', md: '6xl' }}
          lineHeight={'110%'}
        >
          Rec My{' '}
          <Text as={'span'} color={'orange.400'}>
            Record
          </Text>
        </Heading>
        <Text color={'gray.500'} maxW={'3xl'}>
          {
            "Don't know what to listen to next? We've got you covered. Our unique algorithm combines sonic qualities and mood data to find your next favorite album."
          }
        </Text>
        <Stack spacing={6} direction={'row'}>
          <Button
            rounded={'full'}
            px={6}
            colorScheme={'orange'}
            bg={'orange.400'}
            _hover={{ bg: 'orange.500' }}
            onClick={() => router.push('/recommend/album')}
          >
            Get a recommendation
          </Button>
          <Button
            rounded={'full'}
            px={6}
            colorScheme={'orange'}
            bg={'orange.400'}
            _hover={{ bg: 'orange.500' }}
            onClick={() => router.push('/insights')}
          >
            {' '}
            Some insights
          </Button>
          {/* <Button
            rounded={'full'}
            px={6}
            colorScheme={'orange'}
            bg={'orange.400'}
            _hover={{ bg: 'orange.500' }}
            onClick={() => router.push('/map')}
          >
            Browse music map
          </Button> */}
          {/* <Button rounded={'full'} px={6}>
            Learn more
          </Button> */}
        </Stack>
        <Flex w={'full'} justifyContent={'center'}>
          <Image
            src="/music-bro-chilling.svg"
            height={{ sm: '24rem', lg: '28rem' }}
            mb={{ base: 12, sm: 16 }}
            objectFit="contain" // Scale image while maintaining its aspect ratio
            alt="Music bro chilling"
          />
        </Flex>
      </Stack>
    </Container>
  );
}
