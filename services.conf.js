const servicesConf = {
  services: [
    {
      name: "Small Language Model API",
      id: "slm",
      checks: [{
        type: "http",
        endpoint: "https://slm.robog.net/",
      }],
    },
  ],
  others: [ // These services are not managed by me and I have no real control over their uptime
    {
      provider: "Cloudflare",
      operates: "Homepage, DNS, proxy for slm.robog.net",
    },
    {
      provider: "Deno Deploy/GCP",
      operates: "This Page, URL Shortener",
    },
  ],
};

export default servicesConf;
