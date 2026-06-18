import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { Redirect } from "@docusaurus/router";
import Layout from "@theme/Layout";
import React from "react";
import { Ecosystem } from "../sections/Ecosystem";
import { HomePageHeader } from "../sections/HomePageHeader";
import { InstallOpenvino } from "../sections/InstallOpenvino";
import { Performance } from "../sections/Performance";

type HomeCustomFields = {
  rootLandingRedirectTo?: string;
};

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const { rootLandingRedirectTo } =
    (siteConfig.customFields as HomeCustomFields) ?? {};

  if (rootLandingRedirectTo) {
    return <Redirect to={rootLandingRedirectTo} />;
  }

  return (
    <Layout
      title="Home"
      description={`${siteConfig.title} — documentation for the OpenVINO ecosystem.`}
    >
      <HomePageHeader />

      <InstallOpenvino />
      <Performance />
      <Ecosystem />
    </Layout>
  );
}
