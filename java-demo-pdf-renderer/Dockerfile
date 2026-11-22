FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -ntp dependency:go-offline
COPY src ./src

# Install licensed Inter fonts during build; font binaries are not in Git.
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends fonts-inter \
    && mkdir -p src/main/resources/fonts \
    && cp /usr/share/fonts/opentype/inter/Inter-*.otf src/main/resources/fonts/ \
    && cp /usr/share/doc/fonts-inter/copyright src/main/resources/fonts/INTER-LICENSE.txt \
    && test "$(find src/main/resources/fonts -name 'Inter-*.otf' | wc -l)" -ge 18 \
    && rm -rf /var/lib/apt/lists/*

RUN mvn -B -ntp package \
    && java -jar target/renderer.jar --self-test

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd --system --uid 10001 --home /app renderer
COPY --from=build /build/target/renderer.jar /app/renderer.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/renderer.jar"]
