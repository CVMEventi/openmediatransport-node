/**
 * Discovery example — list all OMT sources currently visible on the network.
 *
 * Run:  node examples/discovery.js
 */

import { getAddresses } from '..';

const sources = getAddresses();

if (sources.length === 0) {
  console.log('No sources found. Make sure an OMT sender is running on the network.');
} else {
  console.log(`Found ${sources.length} source(s):\n`);
  for (const address of sources) {
    console.log(' •', address);
  }
}
