import { readPackageJson, writePackageJson } from './package-json';
import { BuildConfig, panic, readFile, writeFile } from './util';
import semver from 'semver';
import execa from 'execa';
import { join } from 'path';
import { validateBuild } from './validate-build';

export async function setVersion(config: BuildConfig) {
  const newVersion = semver.clean(String(config.setVerison), { loose: true })!;
  if (!newVersion) {
    panic(`Invalid semver version "${config.setVerison}"`);
  }

  const distTag = String(config.setDistTag);
  if (distTag == '') {
    panic(`Invalid dist tag "${distTag}"`);
  }

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.lte(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is less than or equal to current version "${oldVersion}"`);
  }

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

  config.setVerison = newVersion;

  console.log(`🐡 version set to "${config.setVerison}"`);
}

export async function publish(config: BuildConfig) {
  await validateBuild(config);

  const newVersion = config.setVerison!;
  const distTag = config.setDistTag!;
  const gitTag = `v${newVersion}`;

  const pkgJsonPath = join(config.distPkgDir, 'package.json');
  const cargoTomlPath = join(config.srcDir, 'napi', 'Cargo.toml');

  const rootPkg = await readPackageJson(config.rootDir);
  const oldVersion = rootPkg.version;

  if (semver.eq(newVersion, oldVersion)) {
    panic(`New version "${newVersion}" is the same as the current version`);
  }

  await execa('git', ['add', pkgJsonPath]);
  await execa('git', ['add', cargoTomlPath]);
  await execa('git', ['commit', '-f', '-m', newVersion]);
  await execa('git', ['tag', '-m', newVersion, gitTag]);
  await execa('git', ['push', '--follow-tags']);
  console.log(`🐠 commit version "${newVersion}" to git with tag "${gitTag}"`);

  // await execa('npm', ['publish', '--dry-run'], { cwd: config.distPkgDir });
  // console.log(`🐋 published @builder.io/qwik to npm`);

  // await execa('npm', ['dist-tag', 'add', `@builder.io/qwik@${newVersion}`, distTag]);
  // console.log(`🐳 set @builder.io/qwik "${distTag}" dist tag to "${newVersion}"`);

  // console.log(`🐬 created github released`);
}
