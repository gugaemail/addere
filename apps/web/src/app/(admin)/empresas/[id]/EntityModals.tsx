'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { Branch, Customer, Product, UserPublic } from '@addere/types'
import { api, getApiErrorMessage } from '@/lib/api'
import { maskCEP, maskDocument, formatCEPDisplay, formatDocumentDisplay } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect } from '@/components/ui/FormField'
import {
  branchSchema, customerSchema, productSchema, makeCompanyUserSchema,
  type BranchFormData, type CompanyUserFormData, type CustomerFormData, type ProductFormData,
} from '@/lib/schemas'

type ModalMode = 'create' | 'edit' | 'copy' | 'view'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'

function FormActions({ loading, onClose, submitLabel }: { loading: boolean; onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
        Cancelar
      </Button>
      <Button type="submit" loading={loading} className="flex-1">
        {submitLabel}
      </Button>
    </div>
  )
}

// ─── Modal Filial ─────────────────────────────────────────────────────────────

interface BranchModalProps {
  companyId: string
  mode: ModalMode
  branch?: Branch
  onClose: () => void
  onSaved: () => void
}

const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function BranchModal({ companyId, mode, branch, onClose, onSaved }: BranchModalProps) {
  // Logo fica fora do react-hook-form (upload de arquivo com preview em data URL)
  const [logo, setLogo] = useState<string | null>(branch?.logo ?? null)

  const {
    register, handleSubmit, setValue,
    formState: { errors, isSubmitting },
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name:        branch?.name        ?? '',
      cnpj:        branch?.cnpj        ?? '',
      idProtheus:  mode === 'copy' ? '' : (branch?.idProtheus ?? ''),
      razaoSocial: branch?.razaoSocial ?? '',
      endereco:    branch?.endereco    ?? '',
      complemento: branch?.complemento ?? '',
      cidade:      branch?.cidade      ?? '',
      estado:      branch?.estado      ?? '',
      cep:         branch?.cep         ?? '',
    },
  })

  const title = mode === 'create' ? 'Nova Filial' : mode === 'copy' ? 'Copiar Filial' : 'Editar Filial'

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setLogo(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function onSubmit(data: BranchFormData) {
    try {
      const body = {
        name:        data.name,
        cnpj:        data.cnpj        || undefined,
        idProtheus:  data.idProtheus  || undefined,
        razaoSocial: data.razaoSocial || undefined,
        endereco:    data.endereco    || undefined,
        complemento: data.complemento || undefined,
        cidade:      data.cidade      || undefined,
        estado:      data.estado      || undefined,
        cep:         data.cep         || undefined,
        logo:        logo             ?? undefined,
      }
      if (mode === 'edit' && branch) {
        await api.patch(`/companies/${companyId}/branches/${branch.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/branches`, body)
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar filial.'))
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title} className="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">

        <p className={SECTION_TITLE}>Identificação</p>
        <FormField label="Nome *" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="CNPJ" placeholder="Opcional" {...register('cnpj')} />
          <FormField label="Código Protheus" placeholder="Opcional" {...register('idProtheus')} />
        </div>
        <FormField label="Razão Social" placeholder="Opcional" {...register('razaoSocial')} />

        <p className={`${SECTION_TITLE} pt-1`}>Endereço</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FormField label="Endereço" placeholder="Rua, número" {...register('endereco')} />
          </div>
          <FormField label="Complemento" placeholder="Sala, andar..." {...register('complemento')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FormField label="Cidade" placeholder="Opcional" {...register('cidade')} />
          </div>
          <FormSelect label="Estado" {...register('estado')}>
            <option value="">UF</option>
            {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </FormSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="CEP"
            placeholder="00000-000"
            {...register('cep', { onChange: (e) => setValue('cep', maskCEP(e.target.value)) })}
          />
        </div>

        <p className={`${SECTION_TITLE} pt-1`}>Logo</p>
        {logo && (
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo da filial" className="h-14 w-auto object-contain rounded border border-[var(--border)] p-1 bg-white" />
            <Button type="button" variant="ghost" size="xs" onClick={() => setLogo(null)} className="text-danger hover:bg-danger/10">
              Remover
            </Button>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            {logo ? 'Trocar imagem' : 'Selecionar imagem'}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="w-full text-sm text-[var(--text-muted)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[var(--bg-subtle)] file:text-[var(--text-primary)] hover:file:bg-[var(--border)] cursor-pointer"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">PNG, JPG ou SVG. Recomendado: fundo transparente.</p>
        </div>

        <FormActions loading={isSubmitting} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
      </form>
    </Modal>
  )
}

// ─── Modal Usuário ────────────────────────────────────────────────────────────

interface UserModalProps {
  companyId: string
  mode: ModalMode
  user?: UserPublic
  onClose: () => void
  onSaved: () => void
}

export function UserModal({ companyId, mode, user, onClose, onSaved }: UserModalProps) {
  const title = mode === 'create' ? 'Novo Usuário' : mode === 'copy' ? 'Copiar Usuário' : 'Editar Usuário'
  const isNew = mode !== 'edit'

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm<CompanyUserFormData>({
    resolver: zodResolver(makeCompanyUserSchema(isNew)),
    defaultValues: {
      name:       user?.name ?? '',
      email:      mode === 'copy' ? '' : (user?.email ?? ''),
      password:   '',
      role:       user?.role === 'ADMIN' ? 'ADMIN' : 'SALESPERSON',
      idVendProt: user?.idVendProt ?? '',
    },
  })

  const role = watch('role')

  async function onSubmit(data: CompanyUserFormData) {
    try {
      if (mode === 'edit' && user) {
        const body: Record<string, unknown> = { name: data.name, email: data.email, role: data.role }
        if (data.password) body.password = data.password
        if (data.role === 'SALESPERSON') body.idVendProt = data.idVendProt || null
        await api.patch(`/companies/${companyId}/users/${user.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/users`, {
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          ...(data.role === 'SALESPERSON' && { idVendProt: data.idVendProt || null }),
        })
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar usuário.'))
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nome" error={errors.name?.message} {...register('name')} />
        <FormField label="E-mail" error={errors.email?.message} {...register('email')} />
        <FormField
          type="password"
          label={
            <>Senha {!isNew && <span className="text-[var(--text-muted)] font-normal">(deixe em branco para manter)</span>}</>
          }
          error={errors.password?.message}
          {...register('password')}
        />
        <FormSelect label="Perfil" error={errors.role?.message} {...register('role')}>
          <option value="SALESPERSON">Vendedor</option>
          <option value="ADMIN">Administrador</option>
        </FormSelect>
        {role === 'SALESPERSON' && (
          <FormField
            label="Cód. Vendedor (Protheus)"
            placeholder="Código do vendedor no ERP (ex: 001)"
            {...register('idVendProt')}
          />
        )}
        <FormActions loading={isSubmitting} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
      </form>
    </Modal>
  )
}

// ─── Modal Cliente ────────────────────────────────────────────────────────────

interface CustomerModalProps {
  companyId: string
  mode: ModalMode
  customer?: Customer
  onClose: () => void
  onSaved: () => void
}

function ViewRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--text-muted)] shrink-0 mr-4">{label}</span>
      <span className="text-sm text-[var(--text-primary)] text-right break-all">{value || '—'}</span>
    </div>
  )
}

export function CustomerModal({ companyId, mode, customer, onClose, onSaved }: CustomerModalProps) {
  const {
    register, handleSubmit, setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name:          customer?.name          ?? '',
      protheusCode:  mode === 'copy' ? '' : (customer?.protheusCode ?? ''),
      loja:          mode === 'copy' ? '' : (customer?.loja         ?? ''),
      document:      customer?.document      ?? '',
      email:         customer?.email         ?? '',
      phone:         customer?.phone         ?? '',
      address:       customer?.address       ?? '',
      municipio:     customer?.municipio     ?? '',
      bairro:        customer?.bairro        ?? '',
      cep:           customer?.cep           ?? '',
      uf:            customer?.uf            ?? '',
      vendorCode:    customer?.vendorCode    ?? '',
      msblql:        customer?.msblql        ?? '2',
      transpPadrao:  customer?.transpPadrao  ?? '',
      condPagPadrao: customer?.condPagPadrao ?? '',
      tes:           customer?.tes           ?? '',
      xcodemp:       customer?.xcodemp       ?? '',
    },
  })

  const isView  = mode === 'view'
  const title   = mode === 'create' ? 'Novo Cliente'
                : mode === 'copy'   ? 'Copiar Cliente'
                : mode === 'view'   ? 'Dados do Cliente'
                : 'Editar Cliente'

  async function onSubmit(data: CustomerFormData) {
    try {
      const body = {
        name:          data.name,
        protheusCode:  data.protheusCode  || undefined,
        loja:          data.loja          || undefined,
        document:      data.document?.replace(/\D/g, '') || undefined,
        email:         data.email         || undefined,
        phone:         data.phone         || undefined,
        address:       data.address       || undefined,
        municipio:     data.municipio     || undefined,
        bairro:        data.bairro        || undefined,
        cep:           data.cep?.replace(/\D/g, '') || undefined,
        uf:            data.uf            || undefined,
        vendorCode:    data.vendorCode    || undefined,
        msblql:        data.msblql        || undefined,
        transpPadrao:  data.transpPadrao  || undefined,
        condPagPadrao: data.condPagPadrao || undefined,
        tes:           data.tes           || undefined,
        xcodemp:       data.xcodemp       || undefined,
      }
      if (mode === 'edit' && customer) {
        await api.patch(`/companies/${companyId}/customers/${customer.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/customers`, body)
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar cliente.'))
    }
  }

  if (isView && customer) {
    return (
      <Modal isOpen onClose={onClose} title={title} className="max-w-2xl">
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-1">
          <p className={`${SECTION_TITLE} mb-2`}>Identificação</p>
          <ViewRow label="Nome"              value={customer.name} />
          <ViewRow label="CPF / CNPJ"        value={formatDocumentDisplay(customer.document)} />
          <ViewRow label="Cod. Protheus"      value={customer.protheusCode} />
          <ViewRow label="Loja"               value={customer.loja} />
          <ViewRow label="Cód. Vendedor"      value={customer.vendorCode} />
          <ViewRow label="Status Protheus"    value={customer.msblql === '1' ? 'Bloqueado' : customer.msblql === '2' ? 'Liberado' : undefined} />

          <p className={`${SECTION_TITLE} mt-4 mb-2`}>Contato</p>
          <ViewRow label="E-mail"    value={customer.email} />
          <ViewRow label="Telefone"  value={customer.phone} />

          <p className={`${SECTION_TITLE} mt-4 mb-2`}>Endereço</p>
          <ViewRow label="Endereço"   value={customer.address} />
          <ViewRow label="Bairro"     value={customer.bairro} />
          <ViewRow label="Município"  value={customer.municipio} />
          <ViewRow label="UF"         value={customer.uf} />
          <ViewRow label="CEP"        value={formatCEPDisplay(customer.cep)} />

          <p className={`${SECTION_TITLE} mt-4 mb-2`}>Padrões Protheus</p>
          <ViewRow label="Transp. Padrão"     value={customer.transpPadrao} />
          <ViewRow label="Cond. Pgto Padrão"  value={customer.condPagPadrao} />
          <ViewRow label="Código TES"          value={customer.tes} />
          <ViewRow label="Filial Faturamento"  value={customer.xcodemp} />
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={title} className="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <p className={SECTION_TITLE}>Identificação</p>
        <FormField label="Nome *" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cod. Protheus" placeholder="Opcional" {...register('protheusCode')} />
          <FormField label="Loja" placeholder="01" {...register('loja')} />
        </div>
        <FormField
          label="CPF / CNPJ"
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          {...register('document', { onChange: (e) => setValue('document', maskDocument(e.target.value)) })}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cód. Vendedor" placeholder="Opcional" {...register('vendorCode')} />
          <FormSelect label="Status Protheus" {...register('msblql')}>
            <option value="2">Liberado</option>
            <option value="1">Bloqueado</option>
          </FormSelect>
        </div>

        <p className={`${SECTION_TITLE} pt-1`}>Contato</p>
        <FormField label="E-mail" placeholder="Opcional" {...register('email')} />
        <FormField label="Telefone" placeholder="Opcional" {...register('phone')} />

        <p className={`${SECTION_TITLE} pt-1`}>Endereço</p>
        <FormField label="Endereço" placeholder="Opcional" {...register('address')} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Município" placeholder="Opcional" {...register('municipio')} />
          <FormField label="Bairro" placeholder="Opcional" {...register('bairro')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FormField
              label="CEP"
              placeholder="00000-000"
              {...register('cep', { onChange: (e) => setValue('cep', maskCEP(e.target.value)) })}
            />
          </div>
          <FormField label="UF" placeholder="SP" {...register('uf')} />
        </div>

        <p className={`${SECTION_TITLE} pt-1`}>Padrões Protheus</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Transp. Padrão" placeholder="Opcional" {...register('transpPadrao')} />
          <FormField label="Cond. Pgto Padrão" placeholder="Opcional" {...register('condPagPadrao')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Código TES" placeholder="Opcional" {...register('tes')} />
          <FormField label="Filial Faturamento" placeholder="Opcional" {...register('xcodemp')} />
        </div>

        <FormActions loading={isSubmitting} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
      </form>
    </Modal>
  )
}

// ─── Modal Produto ────────────────────────────────────────────────────────────

interface ProductModalProps {
  companyId: string
  mode: ModalMode
  product?: Product
  onClose: () => void
  onSaved: () => void
}

export function ProductModal({ companyId, mode, product, onClose, onSaved }: ProductModalProps) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name:         product?.name        ?? '',
      protheusCode: mode === 'copy' ? '' : (product?.protheusCode ?? ''),
      description:  product?.description ?? '',
      price:        product ? String(Number(product.price).toFixed(2)) : '0.00',
      unit:         product?.unit        ?? 'UN',
      stock:        product ? String(Number(product.stock)) : '0',
      saldo:        product ? String(Number(product.saldo)) : '0',
    },
  })

  const title = mode === 'create' ? 'Novo Produto'
              : mode === 'copy'   ? 'Copiar Produto'
              : mode === 'view'   ? 'Dados do Produto'
              : 'Editar Produto'

  async function onSubmit(data: ProductFormData) {
    try {
      const body = {
        name:         data.name,
        protheusCode: data.protheusCode || undefined,
        description:  data.description  || undefined,
        price:        parseFloat(data.price ?? '') || 0,
        unit:         data.unit || 'UN',
        stock:        parseFloat(data.stock ?? '') || 0,
        saldo:        parseFloat(data.saldo ?? '') || 0,
      }
      if (mode === 'edit' && product) {
        await api.patch(`/companies/${companyId}/products/${product.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/products`, body)
      }
      onSaved()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar produto.'))
    }
  }

  if (mode === 'view' && product) {
    return (
      <Modal isOpen onClose={onClose} title={title}>
        <div className="space-y-1">
          <ViewRow label="Nome"           value={product.name} />
          <ViewRow label="Cód. Protheus"  value={product.protheusCode} />
          <ViewRow label="Unidade"        value={product.unit} />
          <ViewRow label="Descrição"      value={product.description} />
          <ViewRow label="Preço (R$)"     value={Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
          <ViewRow label="Estoque"        value={Number(product.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} />
          <ViewRow label="Saldo"          value={Number(product.saldo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} />
          <ViewRow label="Status"         value={product.active ? 'Ativo' : 'Inativo'} />
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <FormField label="Nome *" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cod. Protheus" placeholder="Opcional" {...register('protheusCode')} />
          <FormField label="Unidade" placeholder="UN" {...register('unit')} />
        </div>
        <FormField label="Descrição" placeholder="Opcional" {...register('description')} />
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Preço (R$)" type="number" step="any" min="0" {...register('price')} />
          <FormField label="Estoque" type="number" step="any" min="0" {...register('stock')} />
          <FormField label="Saldo" type="number" step="any" min="0" {...register('saldo')} />
        </div>
        <FormActions loading={isSubmitting} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
      </form>
    </Modal>
  )
}

// ─── Menu de ações ────────────────────────────────────────────────────────────

interface ActionMenuProps {
  onEdit:    () => void
  onCopy:    () => void
  onToggle:  () => void
  onView?:   () => void
  active:    boolean
  label?:    string
}

export function ActionMenu({ onEdit, onCopy, onToggle, onView, active, label }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  return (
    <div className="inline-block text-left">
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        leftIcon={MoreVertical}
        onClick={() => setOpen((v) => !v)}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
        title="Ações"
        aria-label="Ações"
      />

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed z-40 w-44 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-modal overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            {onView && (
              <button
                onClick={() => { setOpen(false); onView() }}
                className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Visualizar {label}
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onEdit() }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Editar {label}
            </button>
            <button
              onClick={() => { setOpen(false); onCopy() }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Copiar {label}
            </button>
            <div className="border-t border-[var(--border)]" />
            <button
              onClick={() => { setOpen(false); onToggle() }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-success hover:bg-success/10'
              }`}
            >
              {active ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
