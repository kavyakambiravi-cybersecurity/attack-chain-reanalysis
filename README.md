# takehome-app

Spring Boot 4.1 / Java 21 starter for the take-home prototype.

## Prerequisites

- JDK 21 (`brew install openjdk@21`)
- No Maven install needed; the project ships with the Maven wrapper (`./mvnw`).

If `java` is not on your PATH after installing via Homebrew:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## Run locally

```bash
./mvnw spring-boot:run
```

Then:

- http://localhost:8080/api/hello
- http://localhost:8080/api/hello?name=Kavya
- http://localhost:8080/actuator/health

## Build and test

```bash
./mvnw verify
```

Produces a runnable jar at `target/takehome-app-0.0.1-SNAPSHOT.jar`.

## Docker

```bash
docker build -t takehome-app .
docker run --rm -p 8080:8080 takehome-app
```

The image honours a `PORT` environment variable, so it deploys unchanged to
Render, Fly.io, Railway, Cloud Run and similar hosts.

## Layout

```
src/main/java/com/kavya/app/Application.java        entry point
src/main/java/com/kavya/app/api/HelloController.java sample REST endpoint
src/main/resources/application.yml                  default config
src/main/resources/application-prod.yml             overrides for SPRING_PROFILES_ACTIVE=prod
src/test/java/...                                   JUnit 5 + MockMvc tests
.github/workflows/ci.yml                            GitHub Actions: ./mvnw verify on push/PR
Dockerfile                                          multi-stage build, JRE runtime image
```
