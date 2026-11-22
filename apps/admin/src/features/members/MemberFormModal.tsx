import { zodResolver } from '@hookform/resolvers/zod';
import { createMemberBody, type MemberDto } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

type FormValues = z.input<typeof createMemberBody>;

/** Create (no `member`) or edit an existing member. Same zod schema as the API. */
export function MemberFormModal({
  member,
  onClose,
  onSaved,
}: {
  member?: MemberDto;
  onClose: () => void;
  onSaved: (m: MemberDto) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(createMemberBody),
    defaultValues: {
      firstName: member?.firstName ?? '',
      lastName: member?.lastName ?? '',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
      dateOfBirth: member?.dateOfBirth ?? '',
      notesPublic: member?.notesPublic ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: z.output<typeof createMemberBody>) =>
      member
        ? api.patch<MemberDto>(`/admin/members/${member.id}`, values)
        : api.post<MemberDto>('/admin/members', values),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['member', m.id] });
      toast.success(t(member ? 'admin.members.updated' : 'admin.members.created'));
      onSaved(m);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        for (const [path, message] of Object.entries(e.fieldErrors())) {
          form.setError(path as keyof FormValues, { message });
        }
        if (!Object.keys(e.fieldErrors()).length) form.setError('root', { message: e.message });
      } else form.setError('root', { message: 'errors.internal' });
    },
  });

  const err = form.formState.errors;
  return (
    <Modal
      open
      onClose={onClose}
      title={t(member ? 'admin.members.edit' : 'admin.members.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="member-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="member-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v as z.output<typeof createMemberBody>))}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label={t('admin.fields.first_name')} required error={err.firstName?.message}>
          {(p) => <Input {...p} autoComplete="off" autoFocus {...form.register('firstName')} />}
        </Field>
        <Field label={t('admin.fields.last_name')} required error={err.lastName?.message}>
          {(p) => <Input {...p} autoComplete="off" {...form.register('lastName')} />}
        </Field>
        <Field
          label={t('admin.fields.phone')}
          error={err.phone?.message}
          hint={t('admin.members.contact_hint')}
        >
          {(p) => <Input {...p} type="tel" {...form.register('phone')} />}
        </Field>
        <Field label={t('admin.fields.email')} error={err.email?.message}>
          {(p) => <Input {...p} type="email" {...form.register('email')} />}
        </Field>
        <Field label={t('admin.fields.date_of_birth')} error={err.dateOfBirth?.message}>
          {(p) => <Input {...p} type="date" {...form.register('dateOfBirth')} />}
        </Field>
        <Field
          label={t('admin.fields.notes_public')}
          error={err.notesPublic?.message}
          hint={t('admin.members.notes_public_hint')}
          className="sm:col-span-2"
        >
          {(p) => <Textarea {...p} className="min-h-16" {...form.register('notesPublic')} />}
        </Field>
        {err.root?.message && (
          <p role="alert" className="sm:col-span-2 text-sm text-status-danger">
            {t(err.root.message)}
          </p>
        )}
      </form>
    </Modal>
  );
}
