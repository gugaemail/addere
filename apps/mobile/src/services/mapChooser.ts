// Menu "abrir em…" (Apple Maps, Google Maps, Waze, copiar endereço): action
// sheet nativo no iOS; no Android o Alert, que mostra no máximo 3 botões —
// as opções do Android nunca passam disso (sem Apple Maps).
import { ActionSheetIOS, Alert, Platform } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {
  routeChoices,
  stopChoices,
  openUrl,
  type GeoTarget,
  type MapChoice,
} from './navigationLinks'

function run(choice: MapChoice): void {
  if ('url' in choice) void openUrl(choice.url)
  else void Clipboard.setStringAsync(choice.copy)
}

function present(title: string, message: string | undefined, choices: MapChoice[]): void {
  if (choices.length === 0) {
    Alert.alert('Sem endereço', 'Este cliente não tem endereço nem localização cadastrados.')
    return
  }
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...choices.map((c) => c.label), 'Cancelar'],
        cancelButtonIndex: choices.length,
      },
      (index) => {
        if (index < choices.length) run(choices[index])
      }
    )
    return
  }
  Alert.alert(
    title,
    message,
    choices.slice(0, 3).map((c) => ({ text: c.label, onPress: () => run(c) })),
    { cancelable: true }
  )
}

/** Navegar até uma parada: o vendedor escolhe o app */
export function chooseStopApp(target: GeoTarget): void {
  present('Navegar até o cliente', target.address ?? undefined, stopChoices(target))
}

/** Rota completa do plano: Google Maps com todas as paradas, ou a 1ª nos demais */
export function chooseRouteApp(targets: GeoTarget[]): void {
  const count = Math.min(targets.length, 10)
  const message =
    targets.length > 10
      ? `As 10 primeiras de ${targets.length} paradas (limite do Google Maps)`
      : `${count} parada(s)`
  present('Abrir rota', message, routeChoices(targets))
}
