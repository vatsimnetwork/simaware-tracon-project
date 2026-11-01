import {parseArgs} from 'node:util';
import {checkContributor, loadContributorRows} from './lib/contributors.ts';

const {
  values: {login, failWhenMissing},
} = parseArgs({
  args: process.argv,
  allowPositionals: true,
  options: {
    login: {
      type: 'string',
    },
    failWhenMissing: {
      type: 'boolean',
    },
  },
});

const result = checkContributor(await loadContributorRows(), login, new Date(), !!failWhenMissing);

console.log(result.output);
if (result.error) throw new Error(result.error);
