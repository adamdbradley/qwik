import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic, writeFile } from './util';
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
  if (semver.lte(newVersion, rootPkg.version)) {
    panic(
      `New version "${newVersion}" is less than or equal to current version "${rootPkg.version}"`
    );
  }

  await checkExistingNpmVersion(newVersion);

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;
  await writePackageJson(config.rootDir, updatedPkg);

  config.setVerison = newVersion;

  console.log(`⬆️ version set to "${config.setVerison}", dist tag set to "${distTag}"`);
}

export async function publish(config: BuildConfig) {
  const dryRun = true || !!config.dryRun;

  if (dryRun) {
    console.log(`⛴ publishing (dry-run)`);
  } else {
    console.log(`🚢 publishing`);
  }

  const distPkgTarPath = join(config.distDir, 'builder.io-qwik.tgz');
  await execa('npm', ['pack', distPkgTarPath]);

  const rootPkg = await readPackageJson(config.rootDir);
  const distTag = dryRun ? 'dryrun' : String(config.setDistTag);
  const newVersion = dryRun ? rootPkg.version : config.setVerison!;
  const gitTag = `v${newVersion}`;

  if (!dryRun) {
    await checkExistingNpmVersion(newVersion);
  }

  await validateBuild(config);

  const pkgJsonPath = join(config.distPkgDir, 'package.json');

  const gitAddArgs = ['add', pkgJsonPath];
  if (dryRun) {
    gitAddArgs.push('--dry-run');
    console.log(`  git ${gitAddArgs.join(' ')}`);
  }
  // await execa('git', gitAddArgs);

  const gitCommitTitle = `"${newVersion}"`;
  const gitCommitBody = `"skip ci"`;
  const gitCommitArgs = ['commit', '-m', gitCommitTitle, '-m', gitCommitBody];
  if (dryRun) {
    gitCommitArgs.push('--dry-run');
    console.log(`  git ${gitCommitArgs.join(' ')}`);
  }
  // await execa('git', gitCommitArgs);

  const gitTagArgs = ['tag', '-f', '-m', newVersion, gitTag];
  if (dryRun) {
    console.log(`  git ${gitTagArgs.join(' ')}`);
  } else {
    // no --dry-run flag for git tag
    // await execa('git', gitTagArgs);
  }

  const gitPushArgs = ['push', '--follow-tags'];
  if (dryRun) {
    gitPushArgs.push('--dry-run');
    console.log(`  git ${gitPushArgs.join(' ')}`);
  }
  // await execa('git', gitCommitArgs);
  console.log(
    `🐳 commit version "${newVersion}" with git tag "${gitTag}"${dryRun ? ` (dry-run)` : ``}`
  );

  const npmPublishArgs = ['publish', distPkgTarPath, '--tag', distTag, '--access', 'public'];

  if (dryRun) {
    npmPublishArgs.push('--dry-run');
    console.log(`  npm ${npmPublishArgs.join(' ')}`);
  }
  // await execa('npm', npmPublishArgs, { cwd: config.distPkgDir });
  console.log(
    `🐋 published version "${newVersion}" of @builder.io/qwik with dist-tag "${distTag}" to npm${
      dryRun ? ` (dry-run)` : ``
    }`
  );

  await createChangelog(config, newVersion, gitTag);
}

async function createChangelog(config: BuildConfig, newVersion: string, gitTag: string) {
  const changelogPath = join(config.distDir, 'CHANGELOG.md');

  const c: string[] = [];
  c.push(newVersion);

  console.log(`🤓 CHANGELOG.md, git tag: ${gitTag}`);
  console.log(`---------------`);
  console.log(c.join('\n'));
  console.log(`---------------`);

  await writeFile(changelogPath, c.join('\n'));
}

async function checkExistingNpmVersion(newVersion: string) {
  const npmVersionsCall = await execa('npm', ['view', '@builder.io/qwik', 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" of @builder.io/qwik is already published to npm`);
  }
}
