# LedgerDesk Free: Node manager API + native OpenPDF worker in ONE container.
# Never proxy customer statements between two independently sleeping Free services.
FROM node:22-bookworm-slim AS dashboard
WORKDIR /web
COPY dashboard/package.json ./
RUN npm install --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM maven:3.9.9-eclipse-temurin-21 AS openpdf-build
WORKDIR /build
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates python3 python3-pip \
 && python3 -m pip install --break-system-packages --no-cache-dir PyMuPDF==1.26.6 Pillow==11.3.0 fonttools==4.60.1 \
 && rm -rf /var/lib/apt/lists/*
COPY java-pdf-stamper/pom.xml ./
COPY java-pdf-stamper/src ./src
COPY java-pdf-stamper/scripts ./scripts
RUN mkdir -p src/main/resources/fonts \
 && curl --fail --location --retry 3 "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf" \
      --output src/main/resources/fonts/Inter-Regular.ttf \
 && python3 scripts/extract_design_assets.py \
 && mvn -B --no-transfer-progress clean package

# Jammy's JRE runs on Debian Bookworm's newer glibc. Keep a Java 21 runtime
# for the OpenPDF 2.2.5 classes without installing a second external service.
FROM eclipse-temurin:21-jre-jammy AS jre

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/java/openjdk/bin:${PATH}"
ENV LEDGERDESK_EMBEDDED_PDF_URL=http://127.0.0.1:10001
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libfontconfig1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=jre /opt/java/openjdk /opt/java/openjdk
RUN java -version
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY --from=dashboard /web/dist ./public
COPY --from=openpdf-build /build/target/ledgerdesk-openpdf-stamper.jar ./openpdf.jar
USER node
EXPOSE 10000
# Node supervises the local Java worker on loopback:10001.
CMD ["node","src/main.mjs"]
