"use client";

import { useState } from "react";
import type { AccessProfile } from "@/lib/acl";
import type { OrgUnit } from "@/lib/org";
import { divisionsOf, teamsOf } from "@/lib/org";

export function OrgTreeAdmin({
  me,
  units,
  users,
  busy,
  onCreate,
  onRename,
  onDelete,
}: {
  me: AccessProfile;
  units: OrgUnit[];
  users: AccessProfile[];
  busy: string | null;
  onCreate: (input: { name: string; kind: "division" | "team"; parentId?: string }) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [newDivision, setNewDivision] = useState("");
  const divisions = divisionsOf(units);
  const visible = me.isSuperAdmin
    ? divisions
    : divisions.filter((unit) => unit.id === me.divisionId);

  const countIn = (divisionId: string, teamId?: string) =>
    users.filter((user) =>
      teamId ? user.teamId === teamId : user.divisionId === divisionId,
    ).length;

  return (
    <div className="panel">
      <h2>조직 · 본부장 — 팀장 — 팀원</h2>
      <p className="sub">
        본부를 만들고 그 아래 팀을 둡니다. 사용자를 본부·팀에 넣은 뒤 역할을 본부장·팀장·팀원으로 지정하세요.
        본부는 슈퍼관리자만 추가·삭제합니다. 본부장은 자기 본부 팀을 관리합니다.
      </p>
      {me.isSuperAdmin ? (
        <div className="org-add">
          <input
            className="cell-input"
            placeholder="본부 이름"
            value={newDivision}
            onChange={(e) => setNewDivision(e.target.value)}
            disabled={busy !== null}
          />
          <button
            className="btn compact"
            type="button"
            disabled={busy !== null || !newDivision.trim()}
            onClick={() => {
              const name = newDivision.trim();
              setNewDivision("");
              void onCreate({ name, kind: "division" });
            }}
          >
            본부 추가
          </button>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <p className="empty">아직 본부가 없습니다. 슈퍼관리자가 본부를 먼저 만듭니다.</p>
      ) : (
        <div className="org-tree">
          {visible.map((division) => (
            <DivisionBlock
              key={division.id}
              division={division}
              teams={teamsOf(units, division.id)}
              people={countIn(division.id)}
              busy={busy}
              canDeleteDivision={me.isSuperAdmin}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              countIn={countIn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DivisionBlock({
  division,
  teams,
  people,
  busy,
  canDeleteDivision,
  onCreate,
  onRename,
  onDelete,
  countIn,
}: {
  division: OrgUnit;
  teams: OrgUnit[];
  people: number;
  busy: string | null;
  canDeleteDivision: boolean;
  onCreate: (input: { name: string; kind: "division" | "team"; parentId?: string }) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  countIn: (divisionId: string, teamId?: string) => number;
}) {
  const [teamName, setTeamName] = useState("");
  return (
    <section className="org-division">
      <OrgRow
        name={division.name}
        count={people}
        busy={busy}
        onRename={() => {
          const next = window.prompt("본부 이름", division.name);
          if (!next || next.trim() === division.name) return;
          void onRename(division.id, next.trim());
        }}
        onDelete={
          canDeleteDivision
            ? () => {
                if (!window.confirm(`본부 「${division.name}」와 하위 팀을 삭제할까요?`)) return;
                void onDelete(division.id);
              }
            : undefined
        }
      />
      {teams.length > 0 ? (
        <ul className="org-teams">
          {teams.map((team) => (
            <li key={team.id}>
              <OrgRow
                name={team.name}
                count={countIn(division.id, team.id)}
                busy={busy}
                onRename={() => {
                  const next = window.prompt("팀 이름", team.name);
                  if (!next || next.trim() === team.name) return;
                  void onRename(team.id, next.trim());
                }}
                onDelete={() => {
                  if (!window.confirm(`팀 「${team.name}」을 삭제할까요?`)) return;
                  void onDelete(team.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="org-teams-empty">아직 팀이 없습니다.</p>
      )}
      <div className="org-add">
        <input
          className="cell-input"
          placeholder="팀 이름"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          disabled={busy !== null}
        />
        <button
          className="btn compact"
          type="button"
          disabled={busy !== null || !teamName.trim()}
          onClick={() => {
            const name = teamName.trim();
            setTeamName("");
            void onCreate({ name, kind: "team", parentId: division.id });
          }}
        >
          팀 추가
        </button>
      </div>
    </section>
  );
}

function OrgRow({
  name,
  count,
  busy,
  onRename,
  onDelete,
}: {
  name: string;
  count: number;
  busy: string | null;
  onRename: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="org-row">
      <strong className="org-row-name" title={name}>
        {name}
      </strong>
      <span className="org-row-count">{count}명</span>
      <span className="org-row-actions">
        <button className="chip" type="button" disabled={busy !== null} onClick={onRename}>
          이름
        </button>
        {onDelete ? (
          <button className="chip" type="button" disabled={busy !== null} onClick={onDelete}>
            삭제
          </button>
        ) : (
          <span className="org-row-spacer" aria-hidden="true" />
        )}
      </span>
    </div>
  );
}
