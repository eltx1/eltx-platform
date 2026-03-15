<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <title>XML Sitemap</title>
        <style>
          :root { color-scheme: light dark; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; }
          h1 { margin: 0 0 .5rem; }
          p { opacity: .8; margin: 0 0 1rem; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d0d7de; padding: .6rem; text-align: left; vertical-align: top; }
          th { font-weight: 600; }
          code { word-break: break-all; font-size: .9rem; }
          ul { margin: 0; padding-left: 1rem; }
        </style>
      </head>
      <body>
        <h1>XML Sitemap</h1>
        <p>
          This sitemap includes English and Arabic alternates for language switching.
        </p>

        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Last Modified</th>
              <th>Change Frequency</th>
              <th>Priority</th>
              <th>Alternates (en/ar/x-default)</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="s:urlset/s:url">
              <tr>
                <td><code><xsl:value-of select="s:loc"/></code></td>
                <td><xsl:value-of select="s:lastmod"/></td>
                <td><xsl:value-of select="s:changefreq"/></td>
                <td><xsl:value-of select="s:priority"/></td>
                <td>
                  <ul>
                    <xsl:for-each select="xhtml:link">
                      <li>
                        <strong><xsl:value-of select="@hreflang"/>:</strong>
                        <code><xsl:value-of select="@href"/></code>
                      </li>
                    </xsl:for-each>
                  </ul>
                </td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
