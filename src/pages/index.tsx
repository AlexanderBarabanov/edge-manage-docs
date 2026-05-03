import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

type SpokeSummary = {
  id: string;
  label: string;
  description?: string;
  routeBasePath: string;
  repo: string;
};

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const spokes = (siteConfig.customFields?.spokes ?? []) as SpokeSummary[];
  return (
    <Layout
      title="Home"
      description={`${siteConfig.title} — documentation for the OpenVINO ecosystem.`}
    >
      <main className={styles.main}>
        <header className={styles.hero}>
          <Heading as="h1">{siteConfig.title}</Heading>
          <p>Documentation for the OpenVINO ecosystem.</p>
        </header>
        <section className={styles.grid}>
          {spokes.map((spoke) => (
            // Each spoke is a separate Docusaurus bundle deployed under its
            // own prefix. Use a plain <a> so the browser does a full
            // navigation; @docusaurus/Link would attempt SPA routing inside
            // the hub bundle (which has no route for the spoke) and render
            // a 404 until the user refreshes.
            <a
              key={spoke.id}
              className={styles.card}
              href={`${siteConfig.baseUrl}${spoke.routeBasePath}/`}
            >
              <Heading as="h2">{spoke.label}</Heading>
              {spoke.description && (
                <p className={styles.description}>{spoke.description}</p>
              )}
              <p className={styles.repo}>{spoke.repo}</p>
            </a>
          ))}
        </section>
      </main>
    </Layout>
  );
}
