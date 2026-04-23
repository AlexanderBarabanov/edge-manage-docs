import type { LoadContext, Plugin } from '@docusaurus/types';
import { access, mkdir, opendir, writeFile } from 'fs/promises';
import path from 'path';

export type GenAISample = {
  language: string;
  languageTitle: string;
  name: string;
  hasReadme: boolean;
  githubLink: string;
  docLink: string;
};

export type GenAISamples = {
  [language: string]: GenAISample[];
};

export type GenAISamplesDocsPluginOptions = {
  /** Unique plugin id (must match id consumed via usePluginData). Default: 'genai-samples-docs-plugin'. */
  id?: string;
  /** Absolute-or-repo-relative path to a directory containing `<language>/<sample>/` subtrees. */
  samplesPath: string;
  /** Absolute-or-repo-relative path where per-sample MDX pages should be written (inside a plugin-content-docs folder). */
  docsOutPath: string;
  /**
   * Base `@site/...` path used inside generated MDX to import each sample's README.md.
   * Example: '@site/spokes/openvino.genai/samples' — the generated MDX imports
   *          `${readmeImportBase}/${language}/${name}/README.md`.
   */
  readmeImportBase: string;
  /** Base GitHub URL for "View on GitHub" links, e.g. 'https://github.com/openvinotoolkit/openvino.genai/tree/master/samples'. */
  githubBaseUrl: string;
  /** Base URL path where the generated sample MDX pages will be served, e.g. '/genai/samples'. */
  docsRouteBase: string;
};

const LANGUAGE_TITLES: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  js: 'JavaScript',
  python: 'Python',
};

async function findSamples(options: GenAISamplesDocsPluginOptions): Promise<GenAISamples> {
  const samplesMap: GenAISamples = {};
  const samplesRoot = path.resolve(options.samplesPath);

  for await (const dir of await opendir(samplesRoot)) {
    const dirPath = path.join(samplesRoot, dir.name);
    if (!dir.isDirectory()) continue;
    const language = dir.name;
    for await (const subdir of await opendir(dirPath)) {
      if (!subdir.isDirectory()) continue;
      if (!samplesMap[language]) samplesMap[language] = [];

      const hasReadme = await access(path.join(dirPath, subdir.name, 'README.md'))
        .then(() => true)
        .catch(() => false);

      samplesMap[language].push({
        language,
        languageTitle: LANGUAGE_TITLES[language] || language,
        name: subdir.name,
        hasReadme,
        githubLink: `${options.githubBaseUrl}/${language}/${subdir.name}`,
        docLink: `${options.docsRouteBase.replace(/\/$/, '')}/${language}/${subdir.name}`,
      });
    }
  }
  return samplesMap;
}

async function generateSamplesDocs(
  samplesMap: GenAISamples,
  options: GenAISamplesDocsPluginOptions,
): Promise<void> {
  const outRoot = path.resolve(options.docsOutPath);
  for (const [language, samples] of Object.entries(samplesMap)) {
    const languageDirPath = path.join(outRoot, language);
    const languageTitle = samples[0]?.languageTitle ?? language;
    await mkdir(languageDirPath, { recursive: true });
    await writeCategory(languageTitle, languageDirPath);
    for (const sample of samples) {
      await writeSampleDocFile(sample, languageDirPath, options);
    }
  }
}

async function writeCategory(language: string, dirPath: string): Promise<void> {
  const content = {
    label: language,
    link: {
      type: 'generated-index',
      description: `OpenVINO GenAI ${language} samples`,
    },
  };
  await writeFile(path.join(dirPath, '_category_.json'), JSON.stringify(content, null, 2));
}

async function writeSampleDocFile(
  sample: GenAISample,
  dirPath: string,
  options: GenAISamplesDocsPluginOptions,
): Promise<void> {
  const sampleDocPath = path.join(dirPath, `${sample.name}.mdx`);

  const readmeImportContent = `
import SampleReadme from '${options.readmeImportBase}/${sample.language}/${sample.name}/README.md';

<Button label="View on GitHub" variant="primary" size="sm" outline link="${sample.githubLink}" />

<SampleReadme />`;

  const fallbackContent = `
# OpenVINO GenAI ${sample.languageTitle} Samples

Refer to the [${sample.languageTitle} ${sample.name} sample](${sample.githubLink}) in GitHub for more information about OpenVINO GenAI ${sample.languageTitle} API.
`;

  const content = `---
hide_title: true
sidebar_label: ${sample.name}
---
${sample.hasReadme ? readmeImportContent : fallbackContent}`;

  await writeFile(sampleDocPath, content);
}

export default function genaiSamplesDocsPlugin(
  _context: LoadContext,
  options: GenAISamplesDocsPluginOptions,
): Plugin {
  const pluginName = 'genai-samples-docs-plugin';
  const pluginId = options.id ?? 'default';
  return {
    name: pluginName,
    async loadContent() {
      return findSamples(options);
    },
    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
    extendCli(cli) {
      // The CLI command is scoped to the plugin instance to disambiguate when
      // multiple instances of the plugin are registered.
      const cmd =
        pluginId === 'default'
          ? `generate-samples-docs:${pluginName}`
          : `generate-samples-docs:${pluginName}:${pluginId}`;
      cli
        .command(cmd)
        .description(`Generate MDX pages from ${options.samplesPath} into ${options.docsOutPath}`)
        .action(async () => {
          console.info(
            `Generating sample docs from ${options.samplesPath} into ${options.docsOutPath}...`,
          );
          const samplesMap = await findSamples(options);
          await generateSamplesDocs(samplesMap, options);
          console.info('Sample docs generated.');
        });
    },
  };
}
