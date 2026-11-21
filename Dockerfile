FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
RUN mvn -B -ntp dependency:go-offline
COPY src ./src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN groupadd -r ledgerly && useradd -r -g ledgerly ledgerly
COPY --from=build /build/target/ledgerly-openpdf-1.0.0.jar /app/ledgerly.jar
USER ledgerly
ENV PORT=8080
EXPOSE 8080
CMD ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.awt.headless=true", "-jar", "/app/ledgerly.jar"]
