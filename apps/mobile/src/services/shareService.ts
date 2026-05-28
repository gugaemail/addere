import * as Sharing from 'expo-sharing'
import * as MailComposer from 'expo-mail-composer'
import * as MediaLibrary from 'expo-media-library'
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

// Solicita permissão e salva o PDF na biblioteca de mídia do dispositivo.
export async function saveToCameraRoll(filePath: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert(
      'Permissão necessária',
      'Para salvar o PDF no seu dispositivo, o Addere precisa de acesso à biblioteca de arquivos. Habilite a permissão nas configurações do app.'
    )
    return
  }
  await MediaLibrary.saveToLibraryAsync(filePath)
  Alert.alert('PDF salvo!', 'O arquivo foi salvo no seu dispositivo com sucesso.')
}
