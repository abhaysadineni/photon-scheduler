#!/bin/bash
# Deploy this folder to an S3 bucket behind CloudFront at /p/photon-scheduler/.
# Set SITE_BUCKET and CF_DISTRIBUTION first; DRY_RUN=1 prints what would be uploaded without uploading.
#   SITE_BUCKET=my-bucket CF_DISTRIBUTION=E123ABC ./deploy.sh
# Assets get a content hash in their URL (?v=...) so a redeploy is never hidden by browser caches.
set -euo pipefail
cd "$(dirname "$0")"
: "${SITE_BUCKET:?set SITE_BUCKET}"; : "${CF_DISTRIBUTION:?set CF_DISTRIBUTION}"
PREFIX="${PREFIX:-p/photon-scheduler}"
A="aws"; B="s3://$SITE_BUCKET/$PREFIX"; DRY=""; [ "${DRY_RUN:-0}" = "1" ] && DRY="--dryrun"
v() { sha1sum "$1" | cut -c1-8; }
TMP="$(mktemp)"
sed -e "s|href=\"app.css[^\"]*\"|href=\"app.css?v=$(v app.css)\"|" \
    -e "s|src=\"app.js[^\"]*\"|src=\"app.js?v=$(v app.js)\"|" \
    -e "s|src=\"physics.js[^\"]*\"|src=\"physics.js?v=$(v physics.js)\"|" \
    -e "s|src=\"scheduler.js[^\"]*\"|src=\"scheduler.js?v=$(v scheduler.js)\"|" \
    -e "s|src=\"stage.js[^\"]*\"|src=\"stage.js?v=$(v stage.js)\"|" index.html > "$TMP"
$A s3 cp "$TMP" "$B/index.html" --cache-control "public, max-age=60" --content-type "text/html; charset=utf-8" $DRY
$A s3 cp app.css "$B/app.css" --cache-control "public, max-age=31536000" --content-type "text/css; charset=utf-8" $DRY
for f in app.js physics.js scheduler.js stage.js; do $A s3 cp "$f" "$B/$f" --cache-control "public, max-age=31536000" --content-type "text/javascript; charset=utf-8" $DRY; done
$A s3 sync fonts "$B/fonts" --cache-control "public, max-age=31536000" $DRY
$A s3 cp favicon.svg "$B/favicon.svg" --cache-control "public, max-age=86400" --content-type "image/svg+xml" $DRY
[ -d data ] && $A s3 sync data "$B/data" --cache-control "public, max-age=3600" --exclude "*.gz" $DRY

[ -z "$DRY" ] && $A cloudfront create-invalidation --distribution-id "$CF_DISTRIBUTION" --paths "/$PREFIX/*" --query Invalidation.Id --output text
rm -f "$TMP"; echo done
