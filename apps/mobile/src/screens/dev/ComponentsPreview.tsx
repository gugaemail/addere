import React, { useState } from 'react'
import { ScrollView, Text, View, StyleSheet } from 'react-native'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { LogoMark } from '../../components/brand/LogoMark'
import { colors, spacing, typography } from '../../theme'

// ─── helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <View style={[s.row, wrap && s.rowWrap]}>{children}</View>
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>
}

// ─── screen ──────────────────────────────────────────────────────────────────

export function ComponentsPreview() {
  const [inputValue, setInputValue] = useState('')

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.pageTitle}>Components Preview</Text>
      <Text style={s.pageSubtitle}>Phase 2 — visual test only</Text>

      {/* ── LogoMark ─────────────────────────────────────────────────────── */}
      <Section title="LogoMark">
        <View style={s.logoRow}>
          {([24, 40, 64, 96] as const).map((size) => (
            <View key={size} style={s.logoItem}>
              <LogoMark size={size} variant="light" />
              <Label>{size}px</Label>
            </View>
          ))}
        </View>
      </Section>

      {/* ── Badge ────────────────────────────────────────────────────────── */}
      <Section title="Badge">
        <Row wrap>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="neutral">Neutral</Badge>
        </Row>
      </Section>

      {/* ── Button — variants ────────────────────────────────────────────── */}
      <Section title="Button — variants">
        <Button variant="primary"   style={s.btn}>Primary</Button>
        <Button variant="secondary" style={s.btn}>Secondary</Button>
        <Button variant="ghost"     style={s.btn}>Ghost</Button>
        <Button variant="danger"    style={s.btn}>Danger</Button>
        <Button variant="primary"   style={s.btn} disabled>Disabled</Button>
        <Button variant="primary"   style={s.btn} loading>Loading</Button>
      </Section>

      {/* ── Button — sizes ───────────────────────────────────────────────── */}
      <Section title="Button — sizes">
        <Row>
          <Button size="sm" style={s.btnInline}>Small</Button>
          <Button size="md" style={s.btnInline}>Medium</Button>
          <Button size="lg" style={s.btnInline}>Large</Button>
        </Row>
      </Section>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <Section title="Input">
        <Input
          label="Default (no value)"
          placeholder="Type something…"
          value={inputValue}
          onChangeText={setInputValue}
        />

        <Input
          label="With value"
          value="vendedor@addere.dev"
          onChangeText={() => {}}
        />

        <Input
          label="Error state"
          value="wrong-email"
          error="E-mail inválido"
          onChangeText={() => {}}
        />

        <Input
          label="Password"
          placeholder="Min 8 characters"
          secureTextEntry
          value=""
          onChangeText={() => {}}
        />

        <Input
          placeholder="No label, hint-like placeholder"
          value=""
          onChangeText={() => {}}
        />
      </Section>

      {/* ── Card — padding variants ───────────────────────────────────────── */}
      <Section title="Card — padding variants">
        {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((p) => (
          <Card key={p} padding={p} style={s.cardItem}>
            <Text style={s.cardText}>padding="{p}" — {spacing[p]}px</Text>
          </Card>
        ))}
      </Section>

      {/* ── Card — composition ───────────────────────────────────────────── */}
      <Section title="Card — composition">
        <Card>
          <Text style={s.cardHeading}>Order #1042</Text>
          <Text style={s.cardSub}>Cliente Demonstração</Text>
          <View style={[s.row, { marginTop: spacing.sm }]}>
            <Badge variant="success">Aprovado</Badge>
            <Badge variant="info">Sincronizado</Badge>
          </View>
        </Card>

        <Card padding="lg" style={s.cardItem}>
          <View style={[s.row, { marginBottom: spacing.sm }]}>
            <Text style={s.cardHeading}>Produto X</Text>
            <Badge variant="warning">Estoque baixo</Badge>
          </View>
          <Text style={s.cardSub}>R$ 149,90 · UN</Text>
        </Card>
      </Section>
    </ScrollView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.neutral.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.xs,
  },
  pageTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.xl,
    color: colors.neutral.text,
    marginBottom: 2,
  },
  pageSubtitle: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowWrap: {
    flexWrap: 'wrap',
  },
  label: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    textAlign: 'center',
    marginTop: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  logoItem: {
    alignItems: 'center',
  },
  btn: {
    alignSelf: 'stretch',
  },
  btnInline: {
    flex: 1,
  },
  cardItem: {
    marginTop: spacing.xs,
  },
  cardText: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  cardHeading: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
    flex: 1,
  },
  cardSub: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
})
