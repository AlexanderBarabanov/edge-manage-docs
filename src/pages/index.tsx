import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

type SpokeSummary = {
  id: string;
  label: string;
  routeBasePath: string;
  repo: string;
};

type ProductCard = {
  title: string;
  description: string;
  routeBasePath?: string; // undefined = placeholder / coming-soon
  repo?: string;
};

const PLACEHOLDER_CARDS: ProductCard[] = [
  {
    title: 'Physical AI',
    description:
      'Perception, planning, and control for embodied AI on Edge devices. Documentation coming soon.',
  },
];

// Per-spoke marketing copy for the product grid. Anything not listed here
// falls back to a generic description.
const SPOKE_DESCRIPTIONS: Record<string, string> = {
  genai:
    'Run and fine-tune generative AI pipelines — LLMs, image, speech, and video — on Intel CPUs, GPUs, and NPUs with OpenVINO.',
};

const SUPPORTED_HARDWARE = [
  { name: 'Intel® Core™ Ultra', note: 'CPU + GPU + NPU' },
  { name: 'Intel® Core™', note: 'CPU, integrated GPU' },
  { name: 'Intel® Xeon®', note: 'Data-center CPU' },
  { name: 'Intel® Arc™ GPU', note: 'Discrete GPU' },
  { name: 'Intel® Data Center GPU', note: 'Flex / Max Series' },
  { name: 'Intel® Atom®', note: 'Embedded CPU' },
];

function toCard(spoke: SpokeSummary): ProductCard {
  return {
    title: spoke.label,
    description:
      SPOKE_DESCRIPTIONS[spoke.id] ??
      `Documentation for ${spoke.label}.`,
    routeBasePath: spoke.routeBasePath,
    repo: spoke.repo,
  };
}

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const spokes = (siteConfig.customFields?.spokes ?? []) as SpokeSummary[];
  const cards: ProductCard[] = [...spokes.map(toCard), ...PLACEHOLDER_CARDS];

  return (
    <Layout
      title="Home"
      description={`${siteConfig.title} — documentation hub for Edge AI projects.`}
    >
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <Heading as="h1" className={styles.heroTitle}>
            {siteConfig.title}
          </Heading>
          <p className={styles.heroTagline}>
            One documentation hub for the Intel® Edge AI stack. Build, optimise,
            and deploy AI workloads on Intel hardware.
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <section>
          <Heading as="h2" className={styles.sectionTitle}>
            Products
          </Heading>
          <div className={styles.grid}>
            {cards.map((card) =>
              card.routeBasePath ? (
                <Link
                  key={card.title}
                  className={styles.card}
                  to={`/${card.routeBasePath}/`}
                >
                  <Heading as="h3" className={styles.cardTitle}>
                    {card.title}
                  </Heading>
                  <p className={styles.cardDescription}>{card.description}</p>
                  {card.repo && <p className={styles.repo}>{card.repo}</p>}
                  <span className={styles.cardCta}>Open docs →</span>
                </Link>
              ) : (
                <div
                  key={card.title}
                  className={`${styles.card} ${styles.cardDisabled}`}
                  aria-disabled="true"
                >
                  <Heading as="h3" className={styles.cardTitle}>
                    {card.title}
                  </Heading>
                  <p className={styles.cardDescription}>{card.description}</p>
                  <span className={styles.cardBadge}>Coming soon</span>
                </div>
              ),
            )}
          </div>
        </section>
      </main>

      <footer className={styles.hardwareFooter}>
        <div className={styles.hardwareInner}>
          <Heading as="h2" className={styles.sectionTitle}>
            Supported hardware
          </Heading>
          <p className={styles.hardwareLead}>
            The products above target Intel® CPUs, GPUs, and NPUs across
            client, edge, and data-centre form factors.
          </p>
          <ul className={styles.hardwareGrid}>
            {SUPPORTED_HARDWARE.map((hw) => (
              <li key={hw.name} className={styles.hardwareItem}>
                <span className={styles.hardwareName}>{hw.name}</span>
                <span className={styles.hardwareNote}>{hw.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </Layout>
  );
}
