FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y curl unzip git openjdk-17-jdk

# Install Flutter
RUN git clone https://github.com/flutter/flutter.git /usr/local/flutter
ENV PATH="/usr/local/flutter/bin:/usr/local/flutter/bin/cache/dart-sdk/bin:${PATH}"

# Install Android SDK
RUN mkdir -p /usr/local/android-sdk && \
    curl -o sdk-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip && \
    unzip sdk-tools.zip -d /usr/local/android-sdk/cmdline-tools && \
    rm sdk-tools.zip

ENV ANDROID_HOME="/usr/local/android-sdk"
ENV PATH="${ANDROID_HOME}/cmdline-tools/bin:${PATH}"
