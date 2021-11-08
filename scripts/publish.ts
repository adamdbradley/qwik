import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';
import { validateBuild } from './validate-build';

export async function setVersion(config: BuildConfig) {
  if (
    (typeof config.setVerison !== 'string' && typeof config.setVerison !== 'number') ||
    String(config.setVerison) === ''
  ) {
    return;
  }

  const distTag = String(config.setDistTag);
  if (distTag === '' && !config.dryRun) {
    panic(`Invalid npm dist tag "${distTag}"`);
  }

  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.lt(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than to current version "${oldVersion}"`);
  }

  await checkExistingNpmVersion(newVersion);

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;
  await writePackageJson(config.rootDir, updatedPkg);

  config.setVerison = newVersion;

  console.log(`⬆️ version set to "${config.setVerison}"`);
}

export async function publish(config: BuildConfig) {
  if (config.dryRun) {
    console.log(`⛴ publishing (dry-run)`);
  } else {
    console.log(`🚢 publishing`);
  }

  const distTag = String(config.setDistTag);
  const newVersion = config.setVerison!;
  const gitTag = `v${newVersion}`;

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.lte(newVersion, oldVersion) && !config.dryRun) {
    panic(`New version "${newVersion}" is less than or equal to current version "${oldVersion}"`);
  }

  await checkExistingNpmVersion(newVersion);

  await validateBuild(config);

  const pkgJsonPath = join(config.distPkgDir, 'package.json');

  const gitAddArgs = ['add', pkgJsonPath];
  if (config.dryRun) {
    gitAddArgs.push('--dry-run');
    console.log(`  git ${gitAddArgs.join(' ')}`);
  }
  // await execa('git', gitAddArgs);

  const gitCommitTitle = `"${newVersion}"`;
  const gitCommitBody = `"skip ci"`;
  const gitCommitArgs = ['commit', '-m', gitCommitTitle, '-m', gitCommitBody];
  if (config.dryRun) {
    gitCommitArgs.push('--dry-run');
    console.log(`  git ${gitCommitArgs.join(' ')}`);
  }
  // await execa('git', gitCommitArgs);

  const gitTagArgs = ['tag', '-f', '-m', newVersion, gitTag];
  if (config.dryRun) {
    console.log(`  git ${gitTagArgs.join(' ')}`);
  } else {
    // no --dry-run flag for git tag
    // await execa('git', gitTagArgs);
  }

  const gitPushArgs = ['push', '--follow-tags'];
  if (config.dryRun) {
    gitPushArgs.push('--dry-run');
    console.log(`  git ${gitPushArgs.join(' ')}`);
  }
  // await execa('git', gitCommitArgs);
  console.log(
    `🐳 commit version "${newVersion}" with git tag "${gitTag}"${config.dryRun ? ` (dry-run)` : ``}`
  );

  const npmPublishArgs = [
    'publish',
    'dist-dev/builder.io-qwik.tgz',
    '--tag',
    distTag,
    '--access',
    'public',
  ];
  if (config.dryRun) {
    npmPublishArgs.push('--dry-run');
    console.log(`  npm ${npmPublishArgs.join(' ')}`);
  }
  // await execa('npm', npmPublishArgs, { cwd: config.distPkgDir });
  console.log(
    `🐋 published version "${newVersion}" of @builder.io/qwik with dist-tag "${distTag}" to npm${
      config.dryRun ? ` (dry-run)` : ``
    }`
  );

  console.log(
    `🐬 created github release "${gitTag}"${
      config.dryRun ? ` (dry-run)` : ``
    }: https://github.com/BuilderIO/qwik/releases/tag/${gitTag}`
  );
}

async function checkExistingNpmVersion(newVersion: string) {
  const npmVersionsCall = await execa('npm', ['view', '@builder.io/qwik', 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" of @builder.io/qwik is already published to npm`);
  }
}
