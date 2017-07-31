package org.jetbrains.vuejs.codeInsight

import com.intellij.openapi.util.text.StringUtil

fun fromAsset(text: String): String {
  val split = StringUtil.unquoteString(text).split("(?=[A-Z])".toRegex()).dropLastWhile(String::isEmpty).toTypedArray()
  for (i in split.indices) {
    split[i] = StringUtil.decapitalize(split[i])
  }
  return StringUtil.join(split, "-")
}

fun toAsset(name: String): String {
  val words = name.split("-".toRegex()).dropLastWhile(String::isEmpty).toTypedArray()
  for (i in 1..words.size - 1) {
    words[i] = StringUtil.capitalize(words[i])
  }
  return StringUtil.join(*words)
}

fun getAllNameVariants(name: String): Set<String> {
  val camelCaseName = toAsset(name).decapitalize()
  val nameVariants = setOf(camelCaseName, fromAsset(name), camelCaseName.capitalize())
  return nameVariants
}
