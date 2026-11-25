// Hebrew interface dictionary, assembled from feature files (roadmap §2.2).
// Each file is a top-level key namespace: common.json -> 'common.*'.
// Keep en/index.ts importing exactly the same files.
import common from './common.json';
import shell from './shell.json';
import auth from './auth.json';
import registration from './registration.json';
import categories from './categories.json';
import onboarding from './onboarding.json';
import dashboard from './dashboard.json';
import campaignsList from './campaignsList.json';
import donations from './donations.json';
import management from './management.json';
import settings from './settings.json';
import partners from './partners.json';
import studio from './studio.json';
import builder from './builder.json';
import editors from './editors.json';
import publicPage from './publicPage.json';
import platform from './platform.json';

const he = {
  common,
  shell,
  auth,
  registration,
  categories,
  onboarding,
  dashboard,
  campaignsList,
  donations,
  management,
  settings,
  partners,
  studio,
  builder,
  editors,
  publicPage,
  platform,
};

export default he;
