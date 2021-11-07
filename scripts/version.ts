import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic, readFile, writeFile } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';

export async function setVersion(config: BuildConfig) {
  if (typeof config.setVerison !== 'string' && typeof config.setVerison !== 'number') {
    return;
  }

  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.eq(newVersion, oldVersion)) {
    return;
  }

  if (semver.lt(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than current version "${oldVersion}"`);
  }

  await validateDistTag(config);

  const npmVersionsCall = await execa('npm', ['view', rootPkg.name, 'versions', '--json']);
  const publishedVersions: string[] = JSON.parse(npmVersionsCall.stdout);
  if (publishedVersions.includes(newVersion)) {
    panic(`Version "${newVersion}" is already published to npm for ${rootPkg.name}`);
  }

  const updatedPkg = { ...rootPkg };
  updatedPkg.version = newVersion;
  await writePackageJson(config.rootDir, updatedPkg);

  const cargoTomlTemplatePath = join(config.srcDir, 'napi', 'Cargo.toml.template');
  const cargoTomlPath = join(config.srcDir, 'napi', 'Cargo.toml');
  const cargoTomlTemplate = await readFile(cargoTomlTemplatePath, 'utf-8');
  const cargoToml = cargoTomlTemplate.replace(`"0.0.0"`, `"${newVersion}"`);
  await writeFile(cargoTomlPath, cargoToml);

  // await execa('git', ['add', config.rootDir]);
  // await execa('git', ['add', cargoTomlPath]);
  // await execa('git', ['commit', '-f', '-m', newVersion]);

  // const gitCommitTag = `v${newVersion}`;
  // await execa('git', ['tag', '-m', newVersion, gitCommitTag]);

  // await execa('git', ['push', '--follow-tags']);

  console.log(`🐱 version set to "${newVersion}"`);
}

async function validateDistTag(config: BuildConfig) {
  const distTag = String(config.validateDistTag);

  if (distTag == '') {
    panic(`Invalid dist tag "${distTag}"`);
  }
}
