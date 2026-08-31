#!/usr/bin/env bash
# Android/Java build environment for local APK builds.
#   usage:  source tools/android-env.sh
# Safe to source repeatedly: PATH entries are de-duplicated.
# Owned by the toolchain setup; nothing else in the repo reads it.

export JAVA_HOME="$HOME/.local/jdk-17/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
# ANDROID_SDK_ROOT is deprecated but still read by some Gradle plugins / RN scripts.
export ANDROID_SDK_ROOT="$ANDROID_HOME"

_ae_prepend_path() {
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}

_ae_prepend_path "$HOME/.npm-global/bin"
_ae_prepend_path "$ANDROID_HOME/emulator"
_ae_prepend_path "$ANDROID_HOME/platform-tools"
_ae_prepend_path "$ANDROID_HOME/cmdline-tools/latest/bin"
_ae_prepend_path "$JAVA_HOME/bin"
export PATH
unset -f _ae_prepend_path

# Gradle needs headroom for the RN/Metro build; tune down if the machine swaps.
export GRADLE_OPTS="${GRADLE_OPTS:--Xmx4g -Dorg.gradle.jvmargs=-Xmx4g}"

if [ -n "${ANDROID_ENV_VERBOSE:-}" ]; then
  echo "JAVA_HOME=$JAVA_HOME"
  echo "ANDROID_HOME=$ANDROID_HOME"
  java -version 2>&1 | head -1
fi

# NDK 27.1.12297006 was auto-installed by the RN Gradle plugin (licence pre-accepted).
# Exported for tools that look it up explicitly; Gradle finds it on its own.
if [ -d "$ANDROID_HOME/ndk/27.1.12297006" ]; then
  export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
fi
