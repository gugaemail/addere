import * as Sharing from 'expo-sharing'
import * as MailComposer from 'expo-mail-composer'
import { Alert } from 'react-native'
import type { Order } from '@addere/types'

// Abre o share sheet nativo do sistema — o usuário escolhe WhatsApp ou qualquer outro app instalado.
// Mais robusto que deep links diretos (wa.me), pois funciona independente da versão instalada.
export async function shareViaWhatsApp(filePath: string, order: Order): Promise<void> {
  const available = await Sharing.isAvailableAsync()
  if (!available) {
    Alert.alert(
      'Compartilhamento indisponível',
      'Seu dispositivo não suporta o compartilhamento de arquivos.'
    )
    return
  }
  await Sharing.shareAsync(filePath, {
    mimeType: 'application/pdf',
    dialogTitle: `Pedido — ${order.customer.name}`,
    UTI: 'com.adobe.pdf',
  })
}

// Abre o compositor de email nativo com o PDF em anexo.
// ATENÇÃO: expo-mail-composer NÃO funciona em simuladores iOS — apenas em dispositivos físicos.
export async function shareViaEmail(filePath: string, order: Order): Promise<void> {
  const available = await MailComposer.isAvailableAsync()
  if (!available) {
    Alert.alert(
      'Email indisponível',
      'O app de email não está configurado neste dispositivo. Configure uma conta de email nas configurações do sistema e tente novamente.'
    )
    return
  }
  await MailComposer.composeAsync({
    subject: `Pedido — ${order.customer.name}`,
    body: `Olá,\n\nSegue em anexo o pedido para ${order.customer.name}.\n\nAtenciosamente,\nAddere`,
    attachments: [filePath],
  })
}

// Abre o share sheet nativo para que o usuário salve o PDF onde preferir
// (Google Drive, Downloads, Arquivos, etc.). MediaLibrary só suporta imagens/vídeos,
// portanto não pode ser usado para PDFs — o share sheet é a abordagem correta.
export async function saveToCameraRoll(filePath: string): Promise<void> {
  const available = await Sharing.isAvailableAsync()
  if (!available) {
    Alert.alert(
      'Compartilhamento indisponível',
      'Seu dispositivo não suporta o salvamento de arquivos.'
    )
    return
  }
  await Sharing.shareAsync(filePath, {
    mimeType: 'application/pdf',
    dialogTitle: 'Salvar PDF no dispositivo',
    UTI: 'com.adobe.pdf',
  })
}
