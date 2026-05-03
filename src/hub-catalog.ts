// Hub-owned content for each spoke (label and description). The hub
// landing page and navbar are the source of truth for how spokes are
// presented; spokes.yml only describes how to fetch and mount them.

export type SpokeCatalogEntry = {
  label: string;
  description: string;
};

export const SPOKE_CATALOG: Record<string, SpokeCatalogEntry> = {
  openvino: {
    label: 'OpenVINO',
    description:
      'Open-source toolkit for deploying performant AI solutions in the cloud, on-prem, and on the edge.',
  },
  genai: {
    label: 'OpenVINO GenAI',
    description: 'Run and deploy generative AI models.',
  },
};
