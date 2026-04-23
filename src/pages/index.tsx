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

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const spokes = (siteConfig.customFields?.spokes ?? []) as SpokeSummary[];
  return (
    <Layout
      title="Home"
      description={`${siteConfig.title} — documentation hub for Edge platform projects.`}
    >
      <main className={styles.main}>
        <header className={styles.hero}>
          <Heading as="h1">{siteConfig.title}</Heading>
          <p>Documentation hub for Edge platform projects.</p>
        </header>
        <section className={styles.grid}>
          {spokes.map((spoke) => (
            <Link
              key={spoke.id}
              className={styles.card}
              to={`/${spoke.routeBasePath}/`}
            >
              <Heading as="h2">{spoke.label}</Heading>
              <p className={styles.repo}>{spoke.repo}</p>
            </Link>
          ))}
        </section>
      </main>
    </Layout>
  );
}
