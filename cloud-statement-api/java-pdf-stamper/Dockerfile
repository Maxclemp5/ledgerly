FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY pom.xml .
COPY src ./src
RUN mkdir -p src/main/resources/fonts \
 && curl -fL "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf" -o src/main/resources/fonts/Inter-Regular.ttf \
 && mvn -B clean package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/ledgerdesk-openpdf-stamper.jar ./app.jar
ENV PORT=10000
EXPOSE 10000
USER 10001
ENTRYPOINT ["java","-XX:MaxRAMPercentage=70.0","-jar","/app/app.jar"]
