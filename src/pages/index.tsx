import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

type ProductCard = {
  title: string;
  description: string;
  link: string;
};

const PRODUCTS: ProductCard[] = [
  {
    title: 'OpenVINO GenAI',
    description:
      'Optimized pipelines for running generative AI models — text generation, image generation, speech recognition, and more — with maximum performance and minimal dependencies.',
    link: '/openvino-genai/',
  },
];

function ProductCardComponent({ title, description, link }: ProductCard) {
  return (
    <Link to={link} className={styles.card}>
      <Heading as="h3" className={styles.cardTitle}>
        {title}
      </Heading>
      <p className={styles.cardDescription}>{description}</p>
      <span className={styles.cardLink}>Explore docs →</span>
    </Link>
  );
}

export default function Home() {
  return (
    <Layout description="Intel Edge AI Documentation Hub">
      <main className={styles.main}>
        <div className={styles.hero}>
          <Heading as="h1" className={styles.heroTitle}>
            Edge AI Documentation
          </Heading>
          <p className={styles.heroSubtitle}>
            Explore documentation for Intel's edge AI toolkits and frameworks.
          </p>
        </div>

        <section className={styles.products}>
          <div className={styles.productsGrid}>
            {PRODUCTS.map((product) => (
              <ProductCardComponent key={product.title} {...product} />
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}
